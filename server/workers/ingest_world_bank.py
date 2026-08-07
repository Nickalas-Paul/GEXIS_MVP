"""
Ingest World Bank WDI indicators into raw_indicators.

API: https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=300&date=2020:2024
"""

from __future__ import annotations

import logging
import sys
import time

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "world_bank"
DATE_RANGE = "2020:2024"
BASE_URL = "https://api.worldbank.org/v2/country/all/indicator/{code}"

INDICATORS = [
    ("NY.GDP.MKTP.CD", "GDP (current US$)", "USD"),
    ("NY.GDP.MKTP.KD.ZG", "GDP growth (annual %)", "percent"),
    ("SP.POP.TOTL", "Population, total", "count"),
    ("LP.LPI.OVRL.XQ", "Logistics Performance Index", "index_score"),
    ("IT.NET.USER.ZS", "Internet users (% of population)", "percent"),
    ("IC.BUS.NDNS.ZS", "New business density", "per_1000_people"),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_world_bank.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_world_bank")


def fetch_indicator(code: str) -> list[dict]:
    url = BASE_URL.format(code=code)
    params = {"format": "json", "per_page": 20000, "date": DATE_RANGE}
    data_url = f"{url}?format=json&per_page=20000&date={DATE_RANGE}"
    logger.info("Fetching %s", data_url)
    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        logger.warning("No data rows for indicator %s", code)
        return []
    rows = payload[1]
    for row in rows:
        row["_data_url"] = data_url
    return rows


def ingest() -> None:
    stored = 0
    skipped_no_geo = 0
    skipped_bad = 0
    fetch_errors = 0
    unmatched_codes: set[str] = set()

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        for code, name, unit in INDICATORS:
            try:
                rows = fetch_indicator(code)
            except Exception:
                fetch_errors += 1
                logger.exception("Failed fetching indicator %s", code)
                continue

            for row in rows:
                iso = (row.get("countryiso3code") or "").strip().upper()
                if not iso or iso not in iso_map:
                    if iso:
                        unmatched_codes.add(iso)
                    skipped_no_geo += 1
                    continue
                try:
                    year = int(row.get("date"))
                except (TypeError, ValueError):
                    skipped_bad += 1
                    continue
                value = row.get("value")
                upsert_indicator(
                    cursor,
                    geography_id=iso_map[iso],
                    source=SOURCE,
                    indicator_code=code,
                    indicator_name=name,
                    value=value,
                    unit=unit,
                    year=year,
                    data_url=row.get("_data_url"),
                )
                stored += 1
            time.sleep(0.2)

    logger.info(
        "Done stored=%s skipped_no_geo=%s skipped_bad=%s fetch_errors=%s unmatched_iso_count=%s",
        stored,
        skipped_no_geo,
        skipped_bad,
        fetch_errors,
        len(unmatched_codes),
    )
    if unmatched_codes:
        sample = sorted(unmatched_codes)[:25]
        logger.info("Sample unmatched ISO codes (aggregates etc.): %s", sample)


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_world_bank completed successfully")
    except Exception:
        logger.exception("ingest_world_bank failed")
        sys.exit(1)
