"""Shared DB connection and file utilities for all workers."""
import os
import hashlib
import logging
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)-8s %(name)s: %(message)s',
    datefmt='%H:%M:%S',
)


def get_db_url() -> str:
    return os.environ.get(
        'DATABASE_URL',
        'postgresql://roseglassdb:roseglassdb@localhost:5432/roseglassdb',
    )


@contextmanager
def db_conn():
    """Yield a connection that auto-commits on clean exit, rolls back on error."""
    conn = psycopg2.connect(get_db_url())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()
