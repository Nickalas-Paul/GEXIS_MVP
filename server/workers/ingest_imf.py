"""
Ingest IMF World Economic Outlook indicators into raw_indicators.

Approach: IMF SDMX 3.0 CSV API (verified working):
  GET https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/*
      ?c[INDICATOR]=NGDPD
  Accept: text/csv

OBS_VALUE is returned in absolute USD (SCALE metadata = 9). We convert to
billions for storage (USD_billions / intl_dollar_billions).

Fallback (documented): static WEO Excel at
https://www.imf.org/-/media/Files/Publications/WEO/WEO-Database/2025/april/WEOApr2025all.xls
"""

from __future__ import annotations

import io
import logging
import sys

import pandas as pd
import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "imf_weo"
YEAR_MIN = 2020
YEAR_MAX = 2024
SDMX_BASE = "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/*"

INDICATORS = [
    ("NGDPD", "imf_gdp_nominal", "IMF GDP current prices", "USD_billions"),
    ("PPPGDP", "imf_gdp_ppp", "IMF GDP PPP", "intl_dollar_billions"),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_imf.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_imf")


def fetch_indicator_csv(weo_code: str) -> pd.DataFrame:
    url = f"{SDMX_BASE}?c[INDICATOR]={weo_code}"
    logger.info("Fetching IMF SDMX CSV for %s", weo_code)
    response = requests.get(url, headers={"Accept": "text/csv"}, timeout=180)
    response.raise_for_status()
    df = pd.read_csv(io.StringIO(response.text), low_memory=False)
    df["_data_url"] = url
    return df


def to_billions(value: float) -> float:
    # SDMX returns absolute currency units for NGDPD/PPPGDP.
    return value / 1_000_000_000.0


def ingest() -> None:
    stored = 0
    skipped = 0
    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for weo_code, indicator_code, indicator_name, unit in INDICATORS:
            try:
                df = fetch_indicator_csv(weo_code)
            except Exception:
                logger.exception("IMF fetch failed for %s", weo_code)
                continue

            if "COUNTRY" not in df.columns or "OBS_VALUE" not in df.columns:
                logger.error("Unexpected IMF columns for %s: %s", weo_code, list(df.columns))
                continue

            for _, row in df.iterrows():
                iso = str(row.get("COUNTRY", "")).strip().upper()
                if iso not in iso_map:
                    skipped += 1
                    continue
                try:
                    year = int(row["TIME_PERIOD"])
                except (TypeError, ValueError):
                    skipped += 1
                    continue
                if year < YEAR_MIN or year > YEAR_MAX:
                    continue
                raw = row.get("OBS_VALUE")
                if pd.isna(raw):
                    value = None
                else:
                    value = to_billions(float(raw))
                upsert_indicator(
                    cursor,
                    geography_id=iso_map[iso],
                    source=SOURCE,
                    indicator_code=indicator_code,
                    indicator_name=indicator_name,
                    value=value,
                    unit=unit,
                    year=year,
                    data_url=row.get("_data_url"),
                )
                stored += 1

    logger.info("Done stored=%s skipped_no_geo_or_bad=%s", stored, skipped)


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_imf completed successfully")
    except Exception:
        logger.exception("ingest_imf failed")
        sys.exit(1)
