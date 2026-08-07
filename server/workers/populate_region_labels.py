"""
Populate geographies.region_label from a complete ISO → region mapping.

Idempotent — safe to re-run. Unmapped ISO codes receive 'Other' and are logged.

Usage (from server/workers):
    python populate_region_labels.py
"""

from __future__ import annotations

import logging
import sys

from config import LOGS_DIR
from db import get_cursor

REGION_ISO_MAP: dict[str, list[str]] = {
    "North America": ["USA", "CAN", "MEX"],
    "Central America & Caribbean": [
        "GTM",
        "BLZ",
        "SLV",
        "HND",
        "NIC",
        "CRI",
        "PAN",
        "CUB",
        "JAM",
        "HTI",
        "DOM",
        "TTO",
        "BHS",
        "BRB",
        "ATG",
        "DMA",
        "GRD",
        "KNA",
        "LCA",
        "VCT",
    ],
    "South America": [
        "BRA",
        "ARG",
        "COL",
        "PER",
        "VEN",
        "CHL",
        "ECU",
        "BOL",
        "PRY",
        "URY",
        "GUY",
        "SUR",
    ],
    "Western Europe": [
        "GBR",
        "FRA",
        "DEU",
        "NLD",
        "BEL",
        "LUX",
        "IRL",
        "AUT",
        "CHE",
        "LIE",
        "MCO",
    ],
    "Northern Europe": ["NOR", "SWE", "FIN", "DNK", "ISL", "EST", "LVA", "LTU"],
    "Southern Europe": [
        "ESP",
        "PRT",
        "ITA",
        "GRC",
        "HRV",
        "SVN",
        "MNE",
        "ALB",
        "MKD",
        "BIH",
        "SRB",
        "MLT",
        "CYP",
        "AND",
    ],
    "Eastern Europe": ["POL", "CZE", "SVK", "HUN", "ROU", "BGR", "UKR", "BLR", "MDA"],
    "Russia & Central Asia": ["RUS", "KAZ", "UZB", "TKM", "TJK", "KGZ"],
    "East Asia": ["CHN", "JPN", "KOR", "PRK", "MNG", "TWN"],
    "Southeast Asia": [
        "SGP",
        "THA",
        "VNM",
        "MYS",
        "IDN",
        "PHL",
        "MMR",
        "KHM",
        "LAO",
        "BRN",
        "TLS",
    ],
    "South Asia": ["IND", "PAK", "BGD", "LKA", "NPL", "BTN", "AFG", "MDV"],
    "Middle East": [
        "SAU",
        "ARE",
        "QAT",
        "KWT",
        "BHR",
        "OMN",
        "YEM",
        "IRQ",
        "IRN",
        "ISR",
        "JOR",
        "LBN",
        "SYR",
        "PSE",
    ],
    "North Africa": ["MAR", "DZA", "TUN", "LBY", "EGY", "SDN", "ESH"],
    "West Africa": [
        "NGA",
        "GHA",
        "CIV",
        "SEN",
        "MLI",
        "BFA",
        "NER",
        "GIN",
        "SLE",
        "LBR",
        "TGO",
        "BEN",
        "GMB",
        "GNB",
        "MRT",
        "CPV",
    ],
    "East Africa": [
        "ETH",
        "KEN",
        "TZA",
        "UGA",
        "RWA",
        "BDI",
        "SSD",
        "SOM",
        "ERI",
        "DJI",
        "MDG",
        "MUS",
        "COM",
        "SYC",
    ],
    "Central Africa": ["COD", "COG", "CMR", "GAB", "GNQ", "TCD", "CAF", "STP"],
    "Southern Africa": [
        "ZAF",
        "NAM",
        "BWA",
        "ZMB",
        "ZWE",
        "MOZ",
        "MWI",
        "AGO",
        "LSO",
        "SWZ",
    ],
    "Oceania": [
        "AUS",
        "NZL",
        "PNG",
        "FJI",
        "SLB",
        "VUT",
        "WSM",
        "TON",
        "FSM",
        "KIR",
        "MHL",
        "PLW",
        "NRU",
        "TUV",
    ],
    "Turkey & Caucasus": ["TUR", "GEO", "ARM", "AZE"],
}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "populate_region_labels.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


logger = logging.getLogger("populate_region_labels")


def mapped_iso_set() -> set[str]:
    codes: set[str] = set()
    for isos in REGION_ISO_MAP.values():
        codes.update(isos)
    return codes


def populate() -> None:
    mapped = mapped_iso_set()

    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT iso_code
            FROM geographies
            WHERE region_type = 'country' AND iso_code IS NOT NULL
            """
        )
        db_isos = {row[0].upper() for row in cursor.fetchall()}
        unmapped = sorted(db_isos - mapped)
        if unmapped:
            logger.warning(
                "Unmapped ISO codes (%s) will be labeled 'Other': %s",
                len(unmapped),
                ", ".join(unmapped),
            )

        for region_label, iso_codes in REGION_ISO_MAP.items():
            cursor.execute(
                """
                UPDATE geographies
                SET region_label = %s, updated_at = NOW()
                WHERE iso_code = ANY(%s)
                """,
                (region_label, iso_codes),
            )
            logger.info(
                "Updated region_label=%r for %s ISO codes (rowcount=%s)",
                region_label,
                len(iso_codes),
                cursor.rowcount,
            )

        if unmapped:
            cursor.execute(
                """
                UPDATE geographies
                SET region_label = %s, updated_at = NOW()
                WHERE iso_code = ANY(%s)
                """,
                ("Other", unmapped),
            )
            logger.info(
                "Updated region_label='Other' for %s ISO codes (rowcount=%s)",
                len(unmapped),
                cursor.rowcount,
            )

        cursor.execute("SELECT COUNT(*) FROM geographies WHERE region_label IS NULL")
        null_count = cursor.fetchone()[0]
        cursor.execute(
            """
            SELECT region_label, COUNT(*)
            FROM geographies
            GROUP BY region_label
            ORDER BY COUNT(*) DESC, region_label
            """
        )
        distribution = cursor.fetchall()

    logger.info("NULL region_label remaining: %s", null_count)
    for label, count in distribution:
        logger.info("region_label=%r count=%s", label, count)


if __name__ == "__main__":
    configure_logging()
    try:
        populate()
        logger.info("populate_region_labels completed successfully")
    except Exception:
        logger.exception("populate_region_labels failed")
        sys.exit(1)
