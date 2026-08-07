"""
Ingest Tax Foundation corporate tax rates into raw_indicators.

Source CSV (ITCI final index data, includes corporate_rate as a fraction):
https://raw.githubusercontent.com/TaxFoundation/international-tax-competitiveness-index/master/final_data/final_index_data_2025.csv

Coverage is OECD-focused. combined_tax_rate is not published in this file — only
corp_tax_rate is stored (fraction converted to percent).
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import pandas as pd
import requests

from config import DATA_DIR, LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "tax_foundation"
CSV_URL = (
    "https://raw.githubusercontent.com/TaxFoundation/"
    "international-tax-competitiveness-index/master/final_data/"
    "final_index_data_2025.csv"
)
CACHE_FILE = DATA_DIR / "final_index_data_2025.csv"


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_tax.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_tax")


def ensure_csv() -> Path:
    if CACHE_FILE.exists() and CACHE_FILE.stat().st_size > 0:
        logger.info("Using cached Tax Foundation CSV: %s", CACHE_FILE)
        return CACHE_FILE
    logger.info("Downloading Tax Foundation CSV from %s", CSV_URL)
    response = requests.get(CSV_URL, timeout=60)
    response.raise_for_status()
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_bytes(response.content)
    logger.info("Cached %s bytes", len(response.content))
    return CACHE_FILE


def ingest() -> None:
    path = ensure_csv()
    df = pd.read_csv(path)
    logger.info("Tax Foundation columns: %s", list(df.columns))
    required = {"ISO_3", "year", "corporate_rate"}
    missing = required - set(df.columns)
    if missing:
        raise RuntimeError(f"Tax Foundation CSV missing columns: {missing}")

    has_combined = "combined_tax_rate" in df.columns or "combined_rate" in df.columns
    combined_col = (
        "combined_tax_rate"
        if "combined_tax_rate" in df.columns
        else ("combined_rate" if "combined_rate" in df.columns else None)
    )
    if not has_combined:
        logger.info("combined_tax_rate not present in CSV — storing corp_tax_rate only")

    stored = 0
    skipped = 0
    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for _, row in df.iterrows():
            iso = str(row["ISO_3"]).strip().upper()
            if iso not in iso_map:
                skipped += 1
                continue
            try:
                year = int(row["year"])
            except (TypeError, ValueError):
                skipped += 1
                continue

            corp = row["corporate_rate"]
            corp_val = None if pd.isna(corp) else float(corp) * 100.0
            upsert_indicator(
                cursor,
                geography_id=iso_map[iso],
                source=SOURCE,
                indicator_code="corp_tax_rate",
                indicator_name="Corporate tax rate",
                value=corp_val,
                unit="percent",
                year=year,
                data_url=CSV_URL,
            )
            stored += 1

            if combined_col:
                comb = row[combined_col]
                comb_val = None if pd.isna(comb) else float(comb) * 100.0
                upsert_indicator(
                    cursor,
                    geography_id=iso_map[iso],
                    source=SOURCE,
                    indicator_code="combined_tax_rate",
                    indicator_name="Combined tax rate",
                    value=comb_val,
                    unit="percent",
                    year=year,
                    data_url=CSV_URL,
                )
                stored += 1

    logger.info("Done stored=%s skipped_no_geo=%s", stored, skipped)


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_tax completed successfully")
    except Exception:
        logger.exception("ingest_tax failed")
        sys.exit(1)
