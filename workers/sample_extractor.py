"""
Sample extractor: detect onsets in audio and extract one-shot samples.

Writes to roseglassdb_sample_extraction_jobs and roseglassdb_instrument_samples.
Auto-creates a sample kit for each job (all hits from the same source form a kit).

Classification is currently rule-based from spectral centroid + attack time.
Replace classify_hit() with an ML classifier once you have labelled examples.

Usage:
    # Extract samples from a stem or loop:
    python -m workers.sample_extractor extract --audio-id 42

    # Extract from a specific file path without a pre-existing DB row:
    python -m workers.sample_extractor extract --audio-id 42 --family drums

    # Poll for pending extraction jobs:
    python -m workers.sample_extractor poll
"""
import json
import logging
from pathlib import Path

import click
import numpy as np
import psycopg2.extras

from .base import db_conn, sha256_file

log = logging.getLogger(__name__)


# ── Onset detection ────────────────────────────────────────────────────────────

def detect_onsets(path: str, hop_size: int = 512, frame_size: int = 1024) -> list[float]:
    """
    Return onset times in seconds using Essentia's HFC onset detection.
    NOTE: Essentia FFT returns a complex numpy array; np.abs/np.angle are cleaner
    than CartesianToPolar for Python consumers.
    """
    import essentia
    import essentia.standard as es

    audio = es.MonoLoader(filename=str(path))()
    sr    = 44100  # MonoLoader default; adjust if source differs

    od  = es.OnsetDetection(method='hfc')
    win = es.Windowing(type='hann')
    fft = es.FFT()

    pool = essentia.Pool()
    for frame in es.FrameGenerator(audio, frameSize=frame_size,
                                   hopSize=hop_size, startFromZero=True):
        spectrum = fft(win(frame))
        mag   = np.abs(spectrum).astype(np.float32)
        phase = np.angle(spectrum).astype(np.float32)
        pool.add('od', od(mag, phase))

    frame_rate = float(sr) / hop_size
    onsets = es.Onsets(frameRate=frame_rate, combine=30)(
        essentia.array([pool['od']]),
        essentia.array([1.0]),
    )
    return list(onsets)


# ── Hit classification (rule-based) ───────────────────────────────────────────

# Rough spectral centroid frequency ranges for common drum hits.
# Upgrade this to a trained classifier once you have enough labelled examples.
_DRUM_RULES = [
    ('kick',         0,     300),
    ('sub_bass',     0,     120),
    ('snare',        200,   3000),
    ('rimshot',      800,   5000),
    ('hihat_closed', 5000,  22000),
    ('hihat_open',   4000,  22000),
    ('clap',         1000,  10000),
    ('cymbal_crash', 3000,  22000),
]


def spectral_centroid_hz(samples: np.ndarray, sr: int) -> float:
    spectrum = np.abs(np.fft.rfft(samples))
    freqs    = np.fft.rfftfreq(len(samples), 1.0 / sr)
    total    = spectrum.sum()
    return float((freqs * spectrum).sum() / total) if total > 0 else 0.0


def classify_hit(samples: np.ndarray, sr: int,
                 target_family: str | None = None) -> tuple[str, str]:
    """
    Returns (instrument_family, instrument_category).
    target_family hint narrows the search when already known (e.g. from stem label).
    """
    centroid = spectral_centroid_hz(samples, sr)

    if target_family == 'drums' or (target_family is None and centroid < 3500):
        # pick closest drum rule by centroid range
        for label, lo, hi in _DRUM_RULES:
            if lo <= centroid < hi:
                return 'drums', label
        return 'drums', 'perc_other'

    if centroid < 500:
        return 'bass', 'bass_note'
    if centroid < 4000:
        return 'melodic', 'synth_stab'
    return 'fx', 'fx'


# ── Slice and ingest a single hit ─────────────────────────────────────────────

def slice_hit(audio: np.ndarray, sr: int, onset_s: float,
              next_onset_s: float, pre_roll_ms: int = 10,
              max_ms: int = 2000) -> np.ndarray:
    """Extract one hit from audio array."""
    start  = max(0, int((onset_s - pre_roll_ms / 1000.0) * sr))
    end    = min(len(audio), int(min(onset_s + max_ms / 1000.0, next_onset_s) * sr))
    return audio[start:end]


# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_source_path(conn, audio_id: int) -> str:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT external_path FROM roseglassdb_master_audio WHERE id=%s', (audio_id,)
        )
        row = cur.fetchone()
        if not row or not row[0]:
            raise ValueError(f'No external_path for audio_id={audio_id}')
        return row[0]


def create_extraction_job(conn, source_audio_id: int,
                          method: str = 'onset_detection',
                          target_family: str = None) -> int:
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO roseglassdb_sample_extraction_jobs
                (source_audio_id, extraction_method, target_family,
                 status, started_at)
            VALUES (%s, %s, %s, 'running', NOW())
            RETURNING id
        """, (source_audio_id, method, target_family))
        job_id = cur.fetchone()[0]
    conn.commit()
    return job_id


def create_auto_kit(conn, job_id: int, source_audio_id: int,
                    kit_type: str = 'drum_kit') -> int:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT original_filename FROM roseglassdb_master_audio WHERE id=%s
        """, (source_audio_id,))
        fname = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO roseglassdb_sample_kits
                (name, kit_type, source_audio_id, extraction_job_id)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (f'Auto: {fname}', kit_type, source_audio_id, job_id))
        kit_id = cur.fetchone()[0]
    conn.commit()
    return kit_id


# ── Near-duplicate check ───────────────────────────────────────────────────────

NEAR_DUP_THRESHOLD = 0.95   # cosine similarity above this = near-duplicate

def find_near_duplicate(conn, audio_id: int, category: str) -> tuple[int, float] | None:
    """
    Query embedding index for closest existing sample of same category.
    Returns (existing_sample_id, similarity) if above threshold, else None.
    Requires roseglassdb_media_analysis embedding to be populated first.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ma.embedding
            FROM roseglassdb_media_analysis ma
            WHERE ma.audio_id = %s AND ma.embedding IS NOT NULL
            LIMIT 1
        """, (audio_id,))
        row = cur.fetchone()
        if not row or row[0] is None:
            return None   # no embedding yet, skip near-dup check

        cur.execute("""
            SELECT s.id,
                   (1.0 - (ma2.embedding <=> ma1.embedding::vector))::real AS sim
            FROM roseglassdb_instrument_samples s
            JOIN roseglassdb_media_analysis ma2 ON ma2.audio_id = s.audio_id
            CROSS JOIN (
                SELECT embedding FROM roseglassdb_media_analysis
                WHERE audio_id=%s AND embedding IS NOT NULL LIMIT 1
            ) ma1
            WHERE s.instrument_category = %s
              AND s.audio_id <> %s
              AND ma2.embedding IS NOT NULL
            ORDER BY ma2.embedding <=> ma1.embedding
            LIMIT 1
        """, (audio_id, category, audio_id))
        row = cur.fetchone()
        if row and row[1] >= NEAR_DUP_THRESHOLD:
            return row[0], row[1]
    return None


# ── Core extraction ────────────────────────────────────────────────────────────

def extract_samples(conn, source_audio_id: int,
                    target_family: str | None,
                    samples_dir: Path) -> int:
    from .beat_slicer import ingest_audio
    from scipy.io import wavfile
    import soundfile as sf

    src_path = get_source_path(conn, source_audio_id)
    log.info('Detecting onsets in %s …', Path(src_path).name)

    onset_times = detect_onsets(src_path)
    if not onset_times:
        log.warning('No onsets detected.')
        return 0

    log.info('%d onsets detected', len(onset_times))

    # Load full audio for slicing
    import essentia.standard as es
    audio = es.MonoLoader(filename=str(src_path))()
    sr    = 44100

    job_id  = create_extraction_job(conn, source_audio_id,
                                    target_family=target_family)
    kit_id  = create_auto_kit(conn, job_id, source_audio_id)
    samples_dir.mkdir(parents=True, exist_ok=True)
    src_stem = Path(src_path).stem

    samples_produced = 0
    sentinel = onset_times[-1] + 2.0   # sentinel for last hit

    for i, onset_s in enumerate(onset_times):
        next_s   = onset_times[i + 1] if i + 1 < len(onset_times) else sentinel
        hit      = slice_hit(audio, sr, onset_s, next_s)

        if len(hit) < sr * 0.02:   # < 20ms — too short, skip
            continue

        onset_ms   = int(round(onset_s * 1000))
        dur_ms     = int(round(len(hit) / sr * 1000))
        out_name   = f'{src_stem}_hit_{onset_ms:07d}ms.wav'
        out_path   = samples_dir / out_name

        sf.write(str(out_path), hit, sr)

        family, category = classify_hit(hit, sr, target_family)
        peak_db = float(20 * np.log10(max(np.abs(hit).max(), 1e-9)))
        velocity = min(127, int(np.abs(hit).max() * 127))

        hit_audio_id, _ = ingest_audio(conn, str(out_path),
                                        source_audio_id=source_audio_id)

        near_dup = find_near_duplicate(conn, hit_audio_id, category)
        near_dup_id    = near_dup[0] if near_dup else None
        near_dup_score = near_dup[1] if near_dup else None

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO roseglassdb_instrument_samples
                    (audio_id, job_id, instrument_family, instrument_category,
                     velocity_estimate, peak_db, onset_ms, duration_ms,
                     near_duplicate_of, similarity_score, is_one_shot)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true)
                RETURNING id
            """, (hit_audio_id, job_id, family, category,
                  velocity, peak_db, onset_ms, dur_ms,
                  near_dup_id, near_dup_score))
            sample_id = cur.fetchone()[0]

            cur.execute("""
                INSERT INTO roseglassdb_sample_kit_members (kit_id, sample_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (kit_id, sample_id))
        conn.commit()

        log.info('  %s  %-14s  dur=%4dms  peak=%.1fdB%s',
                 out_name[-28:], category, dur_ms, peak_db,
                 '  [near-dup]' if near_dup else '')
        samples_produced += 1

    # Mark job complete — fires pg_notify
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE roseglassdb_sample_extraction_jobs
            SET status='complete', samples_produced=%s, finished_at=NOW()
            WHERE id=%s
        """, (samples_produced, job_id))
    conn.commit()

    log.info('Extraction done: %d samples  job_id=%d  kit_id=%d',
             samples_produced, job_id, kit_id)
    return samples_produced


# ── CLI ────────────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """roseglassdb sample extractor — detect onsets and build instrument library."""


@cli.command()
@click.option('--audio-id', required=True, type=int,
              help='master_audio row to extract samples from.')
@click.option('--family', default=None,
              type=click.Choice(['drums','melodic','bass','fx','vocal','other']),
              help='Hint for classification. Omit to auto-detect.')
@click.option('--samples-dir', default='samples/hits', show_default=True)
def extract(audio_id, family, samples_dir):
    """Extract one-shot samples from an audio row."""
    import os
    out_dir = Path(os.environ.get('SAMPLES_DIR', 'samples')) / 'hits'
    with db_conn() as conn:
        count = extract_samples(conn, audio_id, family, out_dir)
    click.echo(f'\n✓ {count} samples extracted from audio_id={audio_id}')


@cli.command()
@click.option('--samples-dir', default='samples/hits', show_default=True)
def poll(samples_dir):
    """Process all pending sample extraction jobs."""
    import os
    out_dir = Path(os.environ.get('SAMPLES_DIR', 'samples')) / 'hits'
    processed = 0
    with db_conn() as conn:
        while True:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE roseglassdb_sample_extraction_jobs
                    SET status='running', started_at=NOW()
                    WHERE id=(
                        SELECT id FROM roseglassdb_sample_extraction_jobs
                        WHERE status='pending' ORDER BY created_at LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    ) RETURNING id, source_audio_id, target_family
                """)
                row = cur.fetchone()
                if not row:
                    break
                conn.commit()
                job_id, src_id, family = row

            try:
                extract_samples(conn, src_id, family, out_dir)
                processed += 1
            except Exception as exc:
                log.error('Extraction job %d failed: %s', job_id, exc)
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE roseglassdb_sample_extraction_jobs
                        SET status='error', error_text=%s, finished_at=NOW()
                        WHERE id=%s
                    """, (str(exc), job_id))
                conn.commit()

    click.echo(f'Processed {processed} job(s).')


if __name__ == '__main__':
    cli()
