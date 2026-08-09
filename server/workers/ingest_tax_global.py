"""
Ingest World Bank global tax indicators into raw_indicators.

API: https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=500&date={range}

Complements Tax Foundation statutory rates (ingest_tax.py) with broader
country coverage under source `tax_global`.
"""

from __future__ import annotations

import logging
import sys
import time
from typing import Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "tax_global"
HISTORICAL_DATE_RANGE = "2000:2024"
BASE_URL = "https://api.worldbank.org/v2/country/all/indicator/{code}"
REQUEST_TIMEOUT_SEC = 180
MAX_RETRIES = 3
PER_PAGE = 500

# (indicator_code, name, unit)
INDICATORS = [
    (
        "GC.TAX.TOTL.GD.ZS",
        "Tax revenue (% of GDP)",
        "percent",
    ),
    (
        "GC.TAX.GSRV.RV.ZS",
        "Taxes on goods and services (% of revenue)",
        "percent",
    ),
    (
        "IC.TAX.TOTL.CP.ZS",
        "Total tax and contribution rate (% of profit)",
        "percent",
    ),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_tax_global.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_tax_global")


def fetch_indicator(api_code: str, date_range: str) -> list[dict]:
    """Fetch all pages for an indicator/date range from the World Bank API."""
    url = BASE_URL.format(code=api_code)
    all_rows: list[dict] = []
    page = 1
    pages = 1
    data_url = f"{url}?format=json&per_page={PER_PAGE}&date={date_range}"

    while page <= pages:
        params = {
            "format": "json",
            "per_page": PER_PAGE,
            "date": date_range,
            "page": page,
        }
        logger.info("Fetching %s (page %s)", data_url, page)

        last_error: Optional[Exception] = None
        payload = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SEC)
                response.raise_for_status()
                payload = response.json()
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Fetch attempt %s/%s failed for %s page %s: %s",
                    attempt,
                    MAX_RETRIES,
                    api_code,
                    page,
                    exc,
                )
                if attempt < MAX_RETRIES:
                    time.sleep(2 * attempt)

        if payload is None:
            assert last_error is not None
            raise last_error

        if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
            if (
                isinstance(payload, list)
                and payload
                and isinstance(payload[0], dict)
                and payload[0].get("message")
            ):
                logger.warning("API message for %s: %s", api_code, payload[0]["message"])
            if page == 1:
                logger.warning("No data rows for indicator %s", api_code)
            break

        meta = payload[0] if isinstance(payload[0], dict) else {}
        pages = int(meta.get("pages") or 1)
        rows = payload[1]
        for row in rows:
            row["_data_url"] = data_url
        all_rows.extend(rows)
        page += 1
        if page <= pages:
            time.sleep(0.2)

    return all_rows


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
                rows = fetch_indicator(code, HISTORICAL_DATE_RANGE)
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
                upsert_indicator(
                    cursor,
                    geography_id=iso_map[iso],
                    source=SOURCE,
                    indicator_code=code,
                    indicator_name=name,
                    value=row.get("value"),
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
        logger.info("ingest_tax_global completed successfully")
    except Exception:
        logger.exception("ingest_tax_global failed")
        sys.exit(1)
