"""
Ingest Tax Foundation corporate tax rates into raw_indicators.

Source CSVs (ITCI final index data, includes corporate_rate as a fraction):
https://github.com/TaxFoundation/international-tax-competitiveness-index/tree/master/final_data

Historical files final_index_data_YYYY.csv are available for 2014–2025 (one year
per file). Each file's `year` column is used as the indicator year.
Coverage is OECD-focused. combined_tax_rate is not published in these files —
only corp_tax_rate is stored (fraction converted to percent).
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
CSV_YEARS = list(range(2014, 2026))
CSV_URL_TMPL = (
    "https://raw.githubusercontent.com/TaxFoundation/"
    "international-tax-competitiveness-index/master/final_data/"
    "final_index_data_{year}.csv"
)


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


def cache_path(year: int) -> Path:
    return DATA_DIR / f"final_index_data_{year}.csv"


def ensure_csv(year: int) -> Path:
    path = cache_path(year)
    if path.exists() and path.stat().st_size > 0:
        logger.info("Using cached Tax Foundation CSV: %s", path)
        return path
    url = CSV_URL_TMPL.format(year=year)
    logger.info("Downloading Tax Foundation CSV from %s", url)
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(response.content)
    logger.info("Cached %s bytes for year %s", len(response.content), year)
    return path


def ingest_year(year: int, iso_map: dict[str, str], cursor) -> tuple[int, int]:
    path = ensure_csv(year)
    df = pd.read_csv(path)
    required = {"ISO_3", "year", "corporate_rate"}
    missing = required - set(df.columns)
    if missing:
        raise RuntimeError(f"Tax Foundation CSV {year} missing columns: {missing}")

    combined_col = (
        "combined_tax_rate"
        if "combined_tax_rate" in df.columns
        else ("combined_rate" if "combined_rate" in df.columns else None)
    )
    if combined_col is None and year == CSV_YEARS[0]:
        logger.info("combined_tax_rate not present in CSV — storing corp_tax_rate only")

    url = CSV_URL_TMPL.format(year=year)
    stored = 0
    skipped = 0
    for _, row in df.iterrows():
        iso = str(row["ISO_3"]).strip().upper()
        if iso not in iso_map:
            skipped += 1
            continue
        try:
            row_year = int(row["year"])
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
            year=row_year,
            data_url=url,
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
                year=row_year,
                data_url=url,
            )
            stored += 1

    return stored, skipped


def ingest() -> None:
    stored = 0
    skipped = 0
    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for year in CSV_YEARS:
            y_stored, y_skipped = ingest_year(year, iso_map, cursor)
            logger.info("Year %s stored=%s skipped=%s", year, y_stored, y_skipped)
            stored += y_stored
            skipped += y_skipped

    logger.info("Done stored=%s skipped_no_geo=%s years=%s", stored, skipped, CSV_YEARS)


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_tax completed successfully")
    except Exception:
        logger.exception("ingest_tax failed")
        sys.exit(1)
