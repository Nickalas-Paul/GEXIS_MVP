"""
Ingest Heritage Foundation Index of Economic Freedom into raw_indicators.

Downloads the latest Excel available from the Heritage download hub
(https://indexdotnet.azurewebsites.net/index/download) — currently 2023 vintage —
and caches it under server/workers/data/.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import requests
from openpyxl import load_workbook

from config import DATA_DIR, LOGS_DIR
from country_aliases import resolve_iso_from_name
from db import (
    get_cursor,
    load_geography_iso_map,
    normalize_country_name,
    upsert_indicator,
)

SOURCE = "heritage"
YEAR = 2023
DOWNLOAD_URL = (
    "https://indexdotnet.azurewebsites.net/index/excel/2023/index2023_data.xlsx"
)
CACHE_FILE = DATA_DIR / "index2023_data.xlsx"

FIELD_MAP = [
    ("2023 Score", "heritage_overall", "Overall Score"),
    ("Business Freedom", "heritage_business_freedom", "Business Freedom"),
    ("Trade Freedom", "heritage_trade_freedom", "Trade Freedom"),
    ("Investment Freedom ", "heritage_investment_freedom", "Investment Freedom"),
    ("Investment Freedom", "heritage_investment_freedom", "Investment Freedom"),
    ("Financial Freedom", "heritage_financial_freedom", "Financial Freedom"),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_heritage.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_heritage")


def ensure_workbook() -> Path:
    if CACHE_FILE.exists() and CACHE_FILE.stat().st_size > 0:
        logger.info("Using cached Heritage workbook: %s", CACHE_FILE)
        return CACHE_FILE
    logger.info("Downloading Heritage data from %s", DOWNLOAD_URL)
    response = requests.get(DOWNLOAD_URL, timeout=120)
    response.raise_for_status()
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_bytes(response.content)
    logger.info("Cached %s bytes to %s", len(response.content), CACHE_FILE)
    return CACHE_FILE


def parse_numeric(raw) -> float | None:
    if raw is None or raw == "" or raw == "N/A" or raw == "#VALUE!":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def ingest() -> None:
    path = ensure_workbook()
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        raise RuntimeError("Heritage workbook is empty")

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    header_index = {h: i for i, h in enumerate(headers)}
    logger.info("Heritage columns: %s", headers)

    name_col = header_index.get("Country Name")
    if name_col is None:
        raise RuntimeError("Country Name column not found in Heritage workbook")

    active_fields = []
    for col_name, code, label in FIELD_MAP:
        if col_name in header_index and code not in {f[1] for f in active_fields}:
            active_fields.append((header_index[col_name], code, label))
    if not active_fields:
        raise RuntimeError("No Heritage indicator columns found")

    stored = 0
    unmatched = []
    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for row in rows[1:]:
            if not row or name_col >= len(row):
                continue
            country_name = row[name_col]
            if not country_name:
                continue
            iso = resolve_iso_from_name(str(country_name), normalize_country_name)
            if not iso or iso not in iso_map:
                # try direct name match against geographies via alias failure
                unmatched.append(str(country_name))
                continue
            geo_id = iso_map[iso]
            for col_idx, code, label in active_fields:
                value = parse_numeric(row[col_idx] if col_idx < len(row) else None)
                upsert_indicator(
                    cursor,
                    geography_id=geo_id,
                    source=SOURCE,
                    indicator_code=code,
                    indicator_name=label,
                    value=value,
                    unit="index_score",
                    year=YEAR,
                    data_url=DOWNLOAD_URL,
                )
                stored += 1

    logger.info("Done stored=%s unmatched_countries=%s", stored, len(unmatched))
    if unmatched:
        logger.info("Unmatched Heritage countries: %s", unmatched)


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_heritage completed successfully")
    except Exception:
        logger.exception("ingest_heritage failed")
        sys.exit(1)
