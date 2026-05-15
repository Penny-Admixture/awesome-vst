"""
Beat slicer: ingest a WAV → Essentia beat tracking → ffmpeg loop extraction.

Usage:
    python -m workers.beat_slicer ingest track.wav
    python -m workers.beat_slicer ingest track.wav --config grid_dense
    python -m workers.beat_slicer ingest track.wav --dry-run
    python -m workers.beat_slicer configs          # list available extraction configs
"""
import json
import logging
import mimetypes
import os
import subprocess
from pathlib import Path

import click
import psycopg2.extras

from .base import db_conn, sha256_file

log = logging.getLogger(__name__)

SAMPLES_DIR = Path(os.environ.get('SAMPLES_DIR', 'samples'))


# ── Audio metadata ─────────────────────────────────────────────────────────────

def probe_audio(path: str) -> dict:
    """Return duration, sample rate, channels etc. via ffprobe."""
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json',
         '-show_streams', '-show_format', path],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    stream = next((s for s in data['streams'] if s['codec_type'] == 'audio'), {})
    fmt = data.get('format', {})
    return {
        'duration_seconds': float(fmt.get('duration', 0)),
        'byte_length':       int(fmt.get('size', Path(path).stat().st_size)),
        'sample_rate_hz':    int(stream.get('sample_rate', 44100)),
        'channels':          int(stream.get('channels', 2)),
        'bit_depth':         int(stream.get('bits_per_sample', 0)) or None,
        'bitrate_kbps':      int(float(fmt.get('bit_rate', 0)) / 1000) or None,
        'codec':             stream.get('codec_name'),
        'container':         fmt.get('format_name', '').split(',')[0],
    }


# ── master_audio ingest ────────────────────────────────────────────────────────

def ingest_audio(conn, path: str, source_audio_id: int = None) -> tuple[int, bool]:
    """
    Insert a file into roseglassdb_master_audio.
    Returns (audio_id, is_new). SHA256 dedup: existing rows are reused.
    """
    digest = sha256_file(str(path))

    with conn.cursor() as cur:
        cur.execute(
            'SELECT id FROM roseglassdb_master_audio WHERE sha256 = %s', (digest,)
        )
        row = cur.fetchone()
        if row:
            log.info('Already in DB (sha256 match) → audio_id=%d', row[0])
            return row[0], False

    meta  = probe_audio(str(path))
    mime  = mimetypes.guess_type(path)[0] or 'audio/wav'
    fname = Path(path).name

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO roseglassdb_master_audio
                (original_filename, mime, sha256, byte_length, duration_seconds,
                 sample_rate_hz, channels, bit_depth, bitrate_kbps, codec,
                 container, external_path, source_audio_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            fname, mime, digest,
            meta['byte_length'],    meta['duration_seconds'],
            meta['sample_rate_hz'], meta['channels'],
            meta['bit_depth'],      meta['bitrate_kbps'],
            meta['codec'],          meta['container'],
            str(path),              source_audio_id,
        ))
        audio_id = cur.fetchone()[0]

    log.info('Ingested %s → audio_id=%d (%.1fs)', fname, audio_id, meta['duration_seconds'])
    return audio_id, True


# ── Beat tracking ──────────────────────────────────────────────────────────────

def run_beat_tracking(conn, audio_id: int, path: str) -> int:
    """
    Run Essentia's RhythmExtractor2013 on path.
    Writes a beat_grid analysis row and returns its id.
    Skips if a beat_grid already exists for this audio_id.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM roseglassdb_media_analysis
            WHERE audio_id = %s AND analysis_type = 'beat_grid'
            ORDER BY id DESC LIMIT 1
        """, (audio_id,))
        row = cur.fetchone()
        if row:
            log.info('beat_grid already exists → analysis_id=%d', row[0])
            return row[0]

    log.info('Running Essentia beat tracker on %s …', Path(path).name)

    # Import here so the CLI still works for --dry-run / --configs even without essentia
    import essentia.standard as es  # noqa: PLC0415

    audio = es.MonoLoader(filename=str(path))()
    bpm, ticks, confidence, _, _ = es.RhythmExtractor2013(method='multifeature')(audio)

    beats_ms     = [int(round(t * 1000)) for t in ticks]
    downbeats_ms = beats_ms[::4]   # 4/4 assumption; good enough for v1

    result = {
        'bpm':            round(float(bpm), 3),
        'beats_ms':       beats_ms,
        'downbeats_ms':   downbeats_ms,
        'time_signature': '4/4',
        'beat_confidence': round(float(confidence), 4),
    }
    log.info('BPM=%.1f  beats=%d  downbeats=%d  confidence=%.2f',
             bpm, len(beats_ms), len(downbeats_ms), confidence)

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO roseglassdb_media_analysis
                (audio_id, model, analysis_type, result_json)
            VALUES (%s, 'essentia', 'beat_grid', %s)
            RETURNING id
        """, (audio_id, json.dumps(result)))
        analysis_id = cur.fetchone()[0]

    conn.commit()
    log.info('Stored beat_grid → analysis_id=%d', analysis_id)
    return analysis_id


# ── Loop extraction ────────────────────────────────────────────────────────────

def get_config_id(conn, config_name: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id FROM roseglassdb_loop_extraction_configs WHERE name = %s',
            (config_name,),
        )
        row = cur.fetchone()
        if not row:
            raise click.ClickException(
                f"Unknown extraction config '{config_name}'. "
                "Run `configs` command to list available ones."
            )
        return row[0]


def get_preview_slices(conn, beat_analysis_id: int, config_id: int) -> list:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            'SELECT * FROM preview_extraction_slices(%s, %s)',
            (beat_analysis_id, config_id),
        )
        return cur.fetchall()


def slice_loops(
    conn,
    source_audio_id: int,
    beat_analysis_id: int,
    config_id: int,
    source_path: str,
    dry_run: bool = False,
) -> int:
    slices = get_preview_slices(conn, beat_analysis_id, config_id)
    if not slices:
        log.warning('No slices produced — check beat_grid and config.')
        return 0

    log.info('%d slices planned', len(slices))

    if dry_run:
        for s in slices[:8]:
            log.info('  [dry-run] downbeat=%5d ms  label=%-20s  dur=%d ms',
                     s['downbeat_ms'], s['label'], s['duration_ms'])
        if len(slices) > 8:
            log.info('  … and %d more', len(slices) - 8)
        return 0

    SAMPLES_DIR.mkdir(exist_ok=True)
    stem = Path(source_path).stem

    # Create job row
    unique_downbeats = len({s['downbeat_ms'] for s in slices})
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO roseglassdb_loop_extraction_jobs
                (source_audio_id, config_id, beat_analysis_id,
                 status, downbeats_found, started_at)
            VALUES (%s, %s, %s, 'running', %s, NOW())
            RETURNING id
        """, (source_audio_id, config_id, beat_analysis_id, unique_downbeats))
        job_id = cur.fetchone()[0]
    conn.commit()
    log.info('Created extraction job_id=%d', job_id)

    # Next available loop_number for this source
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COALESCE(MAX(loop_number), -1)
            FROM roseglassdb_audio_loops WHERE source_audio_id = %s
        """, (source_audio_id,))
        next_num = cur.fetchone()[0] + 1

    loops_created = 0

    for s in slices:
        start_s = s['start_ms'] / 1000.0
        dur_s   = s['duration_ms'] / 1000.0
        label   = s['label']
        out_name = f"{stem}_{label}_db{s['downbeat_index']:04d}.wav"
        out_path = SAMPLES_DIR / out_name

        proc = subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error',
             '-ss', str(start_s), '-t', str(dur_s),
             '-i', str(source_path), str(out_path)],
            capture_output=True, text=True,
        )
        if proc.returncode != 0:
            log.warning('ffmpeg failed for %s: %s', out_name, proc.stderr[:120])
            continue

        loop_audio_id, _ = ingest_audio(conn, str(out_path), source_audio_id=source_audio_id)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO roseglassdb_audio_loops
                    (source_audio_id, loop_number, loop_audio_id, offset_ms, offset_musical)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (source_audio_id, next_num, loop_audio_id, s['start_ms'], label))
        conn.commit()

        next_num     += 1
        loops_created += 1

    # Mark complete — fires pg_notify('loop_extraction_complete', ...)
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE roseglassdb_loop_extraction_jobs
            SET status='complete', loops_created=%s, finished_at=NOW()
            WHERE id=%s
        """, (loops_created, job_id))
    conn.commit()

    log.info('Done: %d loops created  job_id=%d', loops_created, job_id)
    return loops_created


# ── CLI ────────────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """roseglassdb beat slicer — ingest audio, track beats, extract loops."""


@cli.command()
@click.argument('wav_path', type=click.Path(exists=True))
@click.option('--config', default='downbeat_standard', show_default=True,
              help='Loop extraction config name.')
@click.option('--dry-run', is_flag=True,
              help='Show planned slices without writing anything.')
def ingest(wav_path, config, dry_run):
    """Ingest WAV_PATH: beat-track it and slice it into loops."""
    with db_conn() as conn:
        audio_id, _ = ingest_audio(conn, wav_path)
        conn.commit()

        analysis_id = run_beat_tracking(conn, audio_id, wav_path)

        config_id = get_config_id(conn, config)
        count = slice_loops(conn, audio_id, analysis_id, config_id,
                            wav_path, dry_run=dry_run)

    if not dry_run:
        click.echo(f'\n✓ {count} loops created for audio_id={audio_id}')


@cli.command()
def configs():
    """List available loop extraction configs."""
    with db_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                'SELECT name, description FROM roseglassdb_loop_extraction_configs ORDER BY id'
            )
            rows = cur.fetchall()
    for r in rows:
        click.echo(f"  {r['name']:<24}  {r['description']}")


if __name__ == '__main__':
    cli()
