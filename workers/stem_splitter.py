"""
Stem splitter worker: run pending roseglassdb_stem_split_jobs.

Supported splitters (implemented):
  demucs-htdemucs   — calls `python -m demucs` CLI
  crossover-4band   — scipy Butterworth filters, no ML, zero bleed
  crossover-2band   — same

Supported splitters (stubbed — logic marked TODO):
  spleeter-4stem    — needs `pip install spleeter`
  nmf-adaptive      — needs librosa + sklearn
  ica-adaptive      — needs sklearn FastICA
  open-unmix        — needs `pip install openunmix`

Usage:
    # Queue a job for audio_id=42 using demucs:
    python -m workers.stem_splitter queue --audio-id 42 --splitter demucs-htdemucs

    # Process a specific job by id:
    python -m workers.stem_splitter run --job-id 7

    # Poll DB for pending jobs (one pass):
    python -m workers.stem_splitter poll
"""
import json
import logging
import subprocess
import tempfile
from pathlib import Path

import click
import numpy as np
import psycopg2.extras

from .base import db_conn, sha256_file

log = logging.getLogger(__name__)


# ── Audio I/O helpers ──────────────────────────────────────────────────────────

def load_wav_mono(path: str):
    """Load a WAV as mono float32 numpy array via scipy. Returns (samples, sample_rate)."""
    from scipy.io import wavfile
    sr, data = wavfile.read(str(path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype != np.float32:
        data = data.astype(np.float32) / np.iinfo(data.dtype).max
    return data, sr


def write_wav(path: str, samples: np.ndarray, sample_rate: int):
    from scipy.io import wavfile
    # Clip and convert to int16 for broad compatibility
    out = np.clip(samples, -1.0, 1.0)
    out = (out * 32767).astype(np.int16)
    wavfile.write(str(path), sample_rate, out)


def rms_energy(samples: np.ndarray) -> float:
    return float(np.sqrt(np.mean(samples ** 2))) if len(samples) > 0 else 0.0


# ── Splitter implementations ───────────────────────────────────────────────────

def split_demucs(source_path: str, splitter_name: str, out_dir: Path) -> dict[str, Path]:
    """
    Call the Demucs CLI and return {stem_label: wav_path}.
    Demucs output structure: out_dir/<model_name>/<track_stem>/<label>.wav
    """
    # Map our registry names to Demucs --name arguments
    model_map = {
        'demucs-htdemucs': 'htdemucs',
        'demucs-htdemucs-6s': 'htdemucs_6s',
    }
    model = model_map.get(splitter_name, 'htdemucs')
    track_stem = Path(source_path).stem

    result = subprocess.run(
        ['python', '-m', 'demucs',
         '--name', model,
         '--out', str(out_dir),
         str(source_path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f'Demucs failed: {result.stderr[-500:]}')

    stem_dir = out_dir / model / track_stem
    return {p.stem: p for p in stem_dir.glob('*.wav')}


def split_crossover(source_path: str, bands: list[tuple], out_dir: Path) -> dict[str, Path]:
    """
    Frequency-band crossover split using Butterworth filters.
    bands: [(label, low_hz, high_hz), ...]  — use None for no limit.
    """
    from scipy.signal import butter, sosfilt

    audio, sr = load_wav_mono(source_path)
    nyq = sr / 2.0
    result = {}

    for label, lo, hi in bands:
        if lo is None and hi is not None:
            sos = butter(8, hi / nyq, btype='low', output='sos')
        elif lo is not None and hi is None:
            sos = butter(8, lo / nyq, btype='high', output='sos')
        else:
            sos = butter(8, [lo / nyq, hi / nyq], btype='band', output='sos')

        filtered = sosfilt(sos, audio)
        out_path = out_dir / f'{label}.wav'
        write_wav(str(out_path), filtered, sr)
        result[label] = out_path

    return result


def split_nmf(source_path: str, n_components: int, out_dir: Path) -> dict[str, Path]:
    """
    NMF-based source separation via librosa + sklearn.
    TODO: store W matrix rows to roseglassdb_nmf_bases after ingesting stems.
    """
    import librosa
    from sklearn.decomposition import NMF

    y, sr = librosa.load(str(source_path), mono=True)
    S = np.abs(librosa.stft(y))
    phase = np.angle(librosa.stft(y))

    model = NMF(n_components=n_components, init='nndsvda', max_iter=500, random_state=0)
    W = model.fit_transform(S)   # freq × components
    H = model.components_        # components × time

    result = {}
    for i in range(n_components):
        S_i = np.outer(W[:, i], H[i])
        y_i = librosa.istft(S_i * np.exp(1j * phase))
        label = f'component_{i}'
        out_path = out_dir / f'{label}.wav'
        import soundfile as sf
        sf.write(str(out_path), y_i, sr)
        result[label] = out_path

    # TODO: serialize W columns as bytes and INSERT into roseglassdb_nmf_bases
    # one row per component: (job_id, component_index, basis_vector=W[:,i].tobytes(), ...)

    return result


def split_spleeter(source_path: str, n_stems: int, out_dir: Path) -> dict[str, Path]:
    """TODO: implement via `spleeter separate -p spleeter:{n_stems}stems`"""
    raise NotImplementedError('Spleeter worker not yet implemented')


def split_ica(source_path: str, n_components: int, out_dir: Path) -> dict[str, Path]:
    """TODO: implement via sklearn.decomposition.FastICA"""
    raise NotImplementedError('ICA worker not yet implemented')


# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_job(conn, job_id: int) -> dict:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT j.*,
                   sp.name  AS splitter_name,
                   sp.method,
                   sp.is_adaptive,
                   sp.stem_taxonomy,
                   a.external_path AS source_path,
                   a.original_filename
            FROM roseglassdb_stem_split_jobs j
            JOIN roseglassdb_stem_splitters  sp ON sp.id = j.splitter_id
            JOIN roseglassdb_master_audio    a  ON a.id  = j.source_audio_id
            WHERE j.id = %s
        """, (job_id,))
        return dict(cur.fetchone())


def claim_pending_job(conn) -> dict | None:
    """Atomically claim one pending job. Returns job dict or None."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE roseglassdb_stem_split_jobs
            SET status='running', started_at=NOW()
            WHERE id = (
                SELECT id FROM roseglassdb_stem_split_jobs
                WHERE status='pending'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id
        """)
        row = cur.fetchone()
        if not row:
            return None
        conn.commit()
        return get_job(conn, row['id'])


def ingest_stem(conn, stem_path: str, parent_audio_id: int) -> int:
    """Insert a stem WAV into master_audio with source_audio_id=parent."""
    from .beat_slicer import ingest_audio
    audio_id, _ = ingest_audio(conn, str(stem_path), source_audio_id=parent_audio_id)
    return audio_id


def record_stems(conn, job_id: int, parent_id: int,
                 stem_files: dict[str, Path], parent_rms: float):
    """Ingest each stem file and write roseglassdb_audio_stems rows."""
    parent_energy = parent_rms ** 2 if parent_rms > 0 else 1.0
    stems_produced = 0

    for idx, (label, wav_path) in enumerate(sorted(stem_files.items())):
        if not wav_path.exists():
            log.warning('Stem file missing: %s', wav_path)
            continue

        stem_audio_id = ingest_stem(conn, str(wav_path), parent_audio_id=parent_id)

        # Compute energy fraction
        try:
            audio, _ = load_wav_mono(str(wav_path))
            stem_rms = rms_energy(audio)
            energy_fraction = float((stem_rms ** 2) / parent_energy)
        except Exception:
            energy_fraction = None

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO roseglassdb_audio_stems
                    (job_id, parent_audio_id, stem_audio_id,
                     stem_label, stem_index, energy_fraction)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (job_id, stem_index) DO NOTHING
            """, (job_id, parent_id, stem_audio_id, label, idx, energy_fraction))
        conn.commit()

        log.info('  stem %-18s energy=%.3f  audio_id=%d',
                 label, energy_fraction or 0, stem_audio_id)
        stems_produced += 1

    return stems_produced


# ── Job runner ─────────────────────────────────────────────────────────────────

def run_job(conn, job: dict, stems_base_dir: Path):
    job_id    = job['id']
    source_id = job['source_audio_id']
    src_path  = job['source_path']
    splitter  = job['splitter_name']
    method    = job['method']
    n_stems   = job.get('requested_stem_count') or 4

    log.info('Job %d: %s → %s', job_id, Path(src_path).name, splitter)

    stems_base_dir.mkdir(exist_ok=True)
    out_dir = stems_base_dir / f'job_{job_id}'
    out_dir.mkdir(exist_ok=True)

    # Load source for energy reference
    try:
        src_audio, _ = load_wav_mono(src_path)
        parent_rms = rms_energy(src_audio)
    except Exception:
        parent_rms = 1.0

    # Dispatch to correct splitter
    if method == 'ml' and splitter.startswith('demucs'):
        stem_files = split_demucs(src_path, splitter, out_dir)

    elif method == 'crossover' and splitter == 'crossover-4band':
        bands = [
            ('low',      None,  250),
            ('low_mid',   250, 2000),
            ('high_mid', 2000, 8000),
            ('high',     8000,  None),
        ]
        stem_files = split_crossover(src_path, bands, out_dir)

    elif method == 'crossover' and splitter == 'crossover-2band':
        bands = [('sub_bass', None, 80), ('above', 80, None)]
        stem_files = split_crossover(src_path, bands, out_dir)

    elif method == 'nmf':
        stem_files = split_nmf(src_path, n_stems, out_dir)

    elif method == 'ml' and 'spleeter' in splitter:
        stem_files = split_spleeter(src_path, n_stems, out_dir)

    elif method == 'ica':
        stem_files = split_ica(src_path, n_stems, out_dir)

    else:
        raise ValueError(f'No implementation for splitter={splitter} method={method}')

    stems_produced = record_stems(conn, job_id, source_id, stem_files, parent_rms)

    # Mark complete — fires pg_notify('stem_split_complete', ...)
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE roseglassdb_stem_split_jobs
            SET status='complete', stems_produced=%s, finished_at=NOW()
            WHERE id=%s
        """, (stems_produced, job_id))
    conn.commit()
    log.info('Job %d complete: %d stems', job_id, stems_produced)


# ── CLI ────────────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """roseglassdb stem splitter — split loops into stems."""


@cli.command()
@click.option('--audio-id', required=True, type=int)
@click.option('--splitter', default='demucs-htdemucs', show_default=True)
@click.option('--stem-count', default=None, type=int,
              help='For adaptive splitters. Omit to use spectral_profile suggestion.')
def queue(audio_id, splitter, stem_count):
    """Queue a stem split job for a master_audio row."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id FROM roseglassdb_stem_splitters WHERE name=%s', (splitter,)
            )
            row = cur.fetchone()
            if not row:
                raise click.ClickException(f"Unknown splitter '{splitter}'")
            splitter_id = row[0]

            cur.execute("""
                INSERT INTO roseglassdb_stem_split_jobs
                    (source_audio_id, splitter_id, requested_stem_count, status)
                VALUES (%s, %s, %s, 'pending')
                RETURNING id
            """, (audio_id, splitter_id, stem_count))
            job_id = cur.fetchone()[0]

    click.echo(f'Queued job_id={job_id}  audio_id={audio_id}  splitter={splitter}')


@cli.command('run')
@click.option('--job-id', required=True, type=int)
@click.option('--stems-dir', default='samples/stems', show_default=True)
def run_cmd(job_id, stems_dir):
    """Process a specific stem split job by id."""
    import os
    stems_base = Path(os.environ.get('STEMS_DIR', stems_dir))
    with db_conn() as conn:
        job = get_job(conn, job_id)
        run_job(conn, job, stems_base)


@cli.command()
@click.option('--stems-dir', default='samples/stems', show_default=True)
def poll(stems_dir):
    """Claim and run all pending stem split jobs."""
    import os
    stems_base = Path(os.environ.get('STEMS_DIR', stems_dir))
    processed = 0
    with db_conn() as conn:
        while True:
            job = claim_pending_job(conn)
            if not job:
                break
            try:
                run_job(conn, job, stems_base)
                processed += 1
            except Exception as exc:
                log.error('Job %d failed: %s', job['id'], exc)
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE roseglassdb_stem_split_jobs
                        SET status='error', error_text=%s, finished_at=NOW()
                        WHERE id=%s
                    """, (str(exc), job['id']))
                conn.commit()

    click.echo(f'Processed {processed} job(s).')


if __name__ == '__main__':
    cli()
