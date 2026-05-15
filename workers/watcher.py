"""
Pipeline watcher: listens on all NOTIFY channels and chains workers.

With --auto-stems:   loop_extraction_complete → queue one stem job per loop
With --auto-samples: stem_split_complete      → queue sample extraction for each stem

This is optional glue. You can also trigger each step manually.

Usage:
    python -m workers.watcher
    python -m workers.watcher --auto-stems
    python -m workers.watcher --auto-stems --auto-samples
    python -m workers.watcher --auto-stems --splitter crossover-4band
"""
import json
import logging
import select
import signal
import sys

import click
import psycopg2
import psycopg2.extras

from .base import db_conn, get_db_url

log = logging.getLogger(__name__)

CHANNELS = [
    'loop_extraction_complete',
    'stem_split_complete',
    'sample_extraction_complete',
]


def queue_stem_job(conn, loop_audio_id: int, splitter_name: str):
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id FROM roseglassdb_stem_splitters WHERE name=%s', (splitter_name,)
        )
        row = cur.fetchone()
        if not row:
            log.error("Splitter '%s' not found in registry", splitter_name)
            return
        splitter_id = row[0]
        cur.execute("""
            INSERT INTO roseglassdb_stem_split_jobs
                (source_audio_id, splitter_id, status)
            VALUES (%s, %s, 'pending')
            ON CONFLICT DO NOTHING
        """, (loop_audio_id, splitter_id))
    conn.commit()
    log.info('  → queued stem job  audio_id=%d  splitter=%s', loop_audio_id, splitter_name)


def queue_sample_job(conn, stem_audio_id: int, stem_label: str):
    # Infer target_family from stem label for a better classification hint
    label_to_family = {
        'drums': 'drums', 'bass': 'bass', 'vocals': 'vocal',
        'low': 'bass', 'low_mid': 'melodic', 'sub_bass': 'bass',
    }
    family = label_to_family.get(stem_label)
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO roseglassdb_sample_extraction_jobs
                (source_audio_id, extraction_method, target_family, status)
            VALUES (%s, 'onset_detection', %s, 'pending')
        """, (stem_audio_id, family))
    conn.commit()
    log.info('  → queued sample extraction  audio_id=%d  family=%s',
             stem_audio_id, family or 'auto')


def handle_loop_extraction_complete(conn, payload: dict, auto_stems: bool, splitter: str):
    job_id   = payload['job_id']
    src_id   = payload['source_audio_id']
    n_loops  = payload['loops_created']
    log.info('loop_extraction_complete  job=%d  source=%d  loops=%d',
             job_id, src_id, n_loops)

    if not auto_stems:
        return

    # Fetch the loop audio IDs produced by this job
    with conn.cursor() as cur:
        cur.execute("""
            SELECT al.loop_audio_id
            FROM roseglassdb_audio_loops al
            JOIN roseglassdb_loop_extraction_jobs j
              ON j.source_audio_id = al.source_audio_id
            WHERE j.id = %s
        """, (job_id,))
        loop_ids = [r[0] for r in cur.fetchall()]

    for lid in loop_ids:
        queue_stem_job(conn, lid, splitter)


def handle_stem_split_complete(conn, payload: dict, auto_samples: bool):
    job_id       = payload['job_id']
    stems_count  = payload['stems_produced']
    log.info('stem_split_complete  job=%d  stems=%d', job_id, stems_count)

    if not auto_samples:
        return

    # Fetch stems produced by this job
    with conn.cursor() as cur:
        cur.execute("""
            SELECT stem_audio_id, stem_label
            FROM roseglassdb_audio_stems
            WHERE job_id = %s
        """, (job_id,))
        stems = cur.fetchall()

    for stem_audio_id, stem_label in stems:
        queue_sample_job(conn, stem_audio_id, stem_label)


def handle_sample_extraction_complete(payload: dict):
    log.info('sample_extraction_complete  job=%d  samples=%d',
             payload['job_id'], payload.get('samples_produced', '?'))


# ── Main loop ──────────────────────────────────────────────────────────────────

@click.command()
@click.option('--auto-stems',   is_flag=True, help='Auto-queue stem jobs after loop extraction.')
@click.option('--auto-samples', is_flag=True, help='Auto-queue sample extraction after stem split.')
@click.option('--splitter', default='demucs-htdemucs', show_default=True,
              help='Splitter to use when --auto-stems is set.')
def watch(auto_stems, auto_samples, splitter):
    """Listen on all pipeline channels and optionally chain workers."""
    conn = psycopg2.connect(get_db_url())
    conn.set_isolation_level(0)   # autocommit required for LISTEN

    with conn.cursor() as cur:
        for ch in CHANNELS:
            cur.execute(f'LISTEN {ch}')
    log.info('Listening on: %s', ', '.join(CHANNELS))
    if auto_stems:
        log.info('auto-stems ON  splitter=%s', splitter)
    if auto_samples:
        log.info('auto-samples ON')
    log.info('Press Ctrl-C to stop.')

    def _shutdown(sig, frame):
        log.info('Shutting down.')
        conn.close()
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    while True:
        if select.select([conn], [], [], 5.0)[0]:
            conn.poll()
            while conn.notifies:
                notify  = conn.notifies.pop(0)
                payload = json.loads(notify.payload)
                ch      = notify.channel

                if ch == 'loop_extraction_complete':
                    handle_loop_extraction_complete(
                        conn, payload, auto_stems, splitter)
                elif ch == 'stem_split_complete':
                    handle_stem_split_complete(conn, payload, auto_samples)
                elif ch == 'sample_extraction_complete':
                    handle_sample_extraction_complete(payload)


if __name__ == '__main__':
    watch()
