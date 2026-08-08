"""
Ingest World Bank WDI / WGI indicators into raw_indicators.

API: https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=300&date={range}

WGI note: Legacy percentile-rank series (RQ.PER.RNK / GE.PER.RNK / RL.PER.RNK) were
archived from the public Indicators API. The live Worldwide Governance Indicators
source (id=3) exposes successor 0–100 governance scores as GOV_WGI_*.SC. We fetch
those API codes and store them under the canonical PER.RNK codes used by scoring
and Quick Facts so downstream config stays stable.
"""

from __future__ import annotations

import logging
import sys
import time
from typing import Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "world_bank"
DEFAULT_DATE_RANGE = "2020:2024"
WGI_DATE_RANGE = "2014:2024"
BASE_URL = "https://api.worldbank.org/v2/country/all/indicator/{code}"
REQUEST_TIMEOUT_SEC = 180
MAX_RETRIES = 3

# (store_code, api_code, name, unit, date_range)
# api_code is used for the HTTP fetch; store_code is written to raw_indicators.
INDICATORS = [
    ("NY.GDP.MKTP.CD", "NY.GDP.MKTP.CD", "GDP (current US$)", "USD", DEFAULT_DATE_RANGE),
    (
        "NY.GDP.MKTP.KD.ZG",
        "NY.GDP.MKTP.KD.ZG",
        "GDP growth (annual %)",
        "percent",
        DEFAULT_DATE_RANGE,
    ),
    ("SP.POP.TOTL", "SP.POP.TOTL", "Population, total", "count", DEFAULT_DATE_RANGE),
    (
        "LP.LPI.OVRL.XQ",
        "LP.LPI.OVRL.XQ",
        "Logistics Performance Index",
        "index_score",
        DEFAULT_DATE_RANGE,
    ),
    (
        "IT.NET.USER.ZS",
        "IT.NET.USER.ZS",
        "Internet users (% of population)",
        "percent",
        DEFAULT_DATE_RANGE,
    ),
    (
        "IC.BUS.NDNS.ZS",
        "IC.BUS.NDNS.ZS",
        "New business density",
        "per_1000_people",
        DEFAULT_DATE_RANGE,
    ),
    # Worldwide Governance Indicators (0-100 scores; stored as canonical PER.RNK codes)
    (
        "RQ.PER.RNK",
        "GOV_WGI_RQ.SC",
        "Regulatory Quality — Percentile Rank",
        "percentile",
        WGI_DATE_RANGE,
    ),
    (
        "GE.PER.RNK",
        "GOV_WGI_GE.SC",
        "Government Effectiveness — Percentile Rank",
        "percentile",
        WGI_DATE_RANGE,
    ),
    (
        "RL.PER.RNK",
        "GOV_WGI_RL.SC",
        "Rule of Law — Percentile Rank",
        "percentile",
        WGI_DATE_RANGE,
    ),
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


def fetch_indicator(api_code: str, date_range: str) -> list[dict]:
    url = BASE_URL.format(code=api_code)
    params = {"format": "json", "per_page": 20000, "date": date_range}
    data_url = f"{url}?format=json&per_page=20000&date={date_range}"
    logger.info("Fetching %s", data_url)

    last_error: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SEC)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
                # Detect explicit API error messages
                if (
                    isinstance(payload, list)
                    and payload
                    and isinstance(payload[0], dict)
                    and payload[0].get("message")
                ):
                    logger.warning("API message for %s: %s", api_code, payload[0]["message"])
                logger.warning("No data rows for indicator %s", api_code)
                return []
            rows = payload[1]
            for row in rows:
                row["_data_url"] = data_url
            return rows
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Fetch attempt %s/%s failed for %s: %s",
                attempt,
                MAX_RETRIES,
                api_code,
                exc,
            )
            if attempt < MAX_RETRIES:
                time.sleep(2 * attempt)

    assert last_error is not None
    raise last_error


def ingest(only_codes: Optional[set[str]] = None) -> None:
    stored = 0
    skipped_no_geo = 0
    skipped_bad = 0
    fetch_errors = 0
    unmatched_codes: set[str] = set()

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        for store_code, api_code, name, unit, date_range in INDICATORS:
            if only_codes is not None and store_code not in only_codes:
                continue
            try:
                rows = fetch_indicator(api_code, date_range)
            except Exception:
                fetch_errors += 1
                logger.exception("Failed fetching indicator %s (api=%s)", store_code, api_code)
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
                    indicator_code=store_code,
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
        # Optional: python ingest_world_bank.py --wgi-only
        only = {"RQ.PER.RNK", "GE.PER.RNK", "RL.PER.RNK"} if "--wgi-only" in sys.argv else None
        ingest(only_codes=only)
        logger.info("ingest_world_bank completed successfully")
    except Exception:
        logger.exception("ingest_world_bank failed")
        sys.exit(1)
