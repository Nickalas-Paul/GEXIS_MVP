"""Shared configuration for GEXIS data workers."""

from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv
import os

logger = logging.getLogger(__name__)

WORKERS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = WORKERS_DIR.parent.parent
DATA_DIR = WORKERS_DIR / "data"
LOGS_DIR = WORKERS_DIR / "logs"

load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        f"DATABASE_URL is not set. Expected it in {PROJECT_ROOT / '.env'}"
    )

_parsed = urlparse(DATABASE_URL)
_db_host = _parsed.hostname or "unknown"
_db_port = _parsed.port or 5432
_db_name = (_parsed.path or "/").lstrip("/") or "unknown"
print(f"[config] DB target: {_db_host}:{_db_port}/{_db_name}")

DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)


def get_db_connection(**kwargs):
    """Open a new psycopg2 connection using DATABASE_URL."""
    logger.debug("Opening psycopg2 connection to %s:%s/%s", _db_host, _db_port, _db_name)
    return psycopg2.connect(DATABASE_URL, **kwargs)
