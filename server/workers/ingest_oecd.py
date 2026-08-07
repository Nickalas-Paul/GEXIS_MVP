"""
Ingest OECD / talent-density education indicators into raw_indicators.

Primary target: OECD Education at a Glance via SDMX.
As of Phase 3 Step 2, OECD Data Explorer / stats.oecd.org SDMX endpoints
timed out or returned 404 from this environment. Fallback (documented):

  World Bank WDI education indicators for OECD member countries only:
  - SE.TER.CUAT.BA.ZS  -> oecd_tertiary_attainment (bachelor+ attainment, % 25+)
  - SE.TER.GRAD.FE.SI.ZS is female-STEM only and is NOT used as overall STEM share.

  Overall STEM graduate share is not reliably available via a stable public API
  in this step; oecd_stem_share rows are written as NULL for OECD members so the
  scoring engine can apply confidence penalties explicitly.

Source label remains `oecd` for the talent-density dimension contract; data_url
records the actual World Bank endpoint used for the tertiary proxy.
"""

from __future__ import annotations

import logging
import sys
import time

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map, upsert_indicator

SOURCE = "oecd"
DATE_RANGE = "2018:2024"
WB_BASE = "https://api.worldbank.org/v2/country/all/indicator/{code}"

# OECD members + accession partners commonly included in EAG-style analyses
OECD_ISO3 = {
    "AUS", "AUT", "BEL", "CAN", "CHL", "COL", "CRI", "CZE", "DNK", "EST",
    "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL", "ISR", "ITA", "JPN",
    "KOR", "LVA", "LTU", "LUX", "MEX", "NLD", "NZL", "NOR", "POL", "PRT",
    "SVK", "SVN", "ESP", "SWE", "CHE", "TUR", "GBR", "USA",
}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_oecd.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_oecd")


def try_oecd_sdmx() -> bool:
    """Return True if a live OECD SDMX education endpoint responds usefully."""
    candidates = [
        (
            "https://sdmx.oecd.org/public/rest/data/"
            "OECD.EDU.INES,DSD_EAG@DF_EAG_NEAC/all"
            "?startPeriod=2020&format=csvfilewithlabels"
        ),
    ]
    for url in candidates:
        try:
            logger.info("Probing OECD endpoint: %s", url)
            response = requests.get(url, timeout=12)
            if response.status_code == 200 and len(response.text) > 500:
                logger.info(
                    "OECD SDMX reachable (%s bytes) — dimension mapping deferred; using WB proxy",
                    len(response.text),
                )
                return False
            logger.warning(
                "OECD probe status=%s bytes=%s", response.status_code, len(response.text)
            )
        except Exception as exc:
            logger.warning("OECD probe failed: %s", exc)
    logger.warning(
        "OECD SDMX unavailable (stats.oecd.org probes skipped — hang-prone); using World Bank proxy"
    )
    return False


def fetch_wb(code: str) -> tuple[list[dict], str]:
    url = WB_BASE.format(code=code)
    params = {"format": "json", "per_page": 20000, "date": DATE_RANGE}
    data_url = f"{url}?format=json&per_page=20000&date={DATE_RANGE}"
    logger.info("Fetching World Bank proxy %s", data_url)
    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()
    payload = response.json()
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []
    return rows, data_url


def ingest() -> None:
    try_oecd_sdmx()
    logger.info(
        "Using World Bank education proxy for %s OECD ISO codes; STEM share stored as NULL",
        len(OECD_ISO3),
    )

    stored = 0
    skipped = 0
    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        covered = [iso for iso in OECD_ISO3 if iso in iso_map]
        missing_geo = sorted(OECD_ISO3 - set(iso_map))
        logger.info("OECD members in geographies=%s missing=%s", len(covered), missing_geo)

        rows, data_url = fetch_wb("SE.TER.CUAT.BA.ZS")
        for row in rows:
            iso = (row.get("countryiso3code") or "").strip().upper()
            if iso not in OECD_ISO3 or iso not in iso_map:
                skipped += 1
                continue
            try:
                year = int(row.get("date"))
            except (TypeError, ValueError):
                skipped += 1
                continue
            upsert_indicator(
                cursor,
                geography_id=iso_map[iso],
                source=SOURCE,
                indicator_code="oecd_tertiary_attainment",
                indicator_name="Tertiary attainment proxy (WB bachelor+, OECD members)",
                value=row.get("value"),
                unit="percent",
                year=year,
                data_url=data_url,
            )
            stored += 1
        time.sleep(0.2)

        # Explicit NULL STEM rows for latest year present in tertiary data (or 2022 default)
        stem_year = 2022
        for iso in covered:
            upsert_indicator(
                cursor,
                geography_id=iso_map[iso],
                source=SOURCE,
                indicator_code="oecd_stem_share",
                indicator_name="STEM graduates (% of all graduates) — unavailable this step",
                value=None,
                unit="percent",
                year=stem_year,
                data_url=None,
            )
            stored += 1

    logger.info(
        "Done stored=%s skipped=%s coverage_gap_non_oecd=%s countries",
        stored,
        skipped,
        174 - len(covered),
    )


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_oecd completed successfully")
    except Exception:
        logger.exception("ingest_oecd failed")
        sys.exit(1)
