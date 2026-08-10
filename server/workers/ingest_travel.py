"""
Ingest US State Department travel advisories into market_signals (Layer 2).

RSS: https://travel.state.gov/_res/rss/TAsTWs.xml (no auth)
Only Level 3 and Level 4 advisories become signals.
"""

from __future__ import annotations

import logging
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications

SOURCE = "state_dept"
SIGNAL_TYPE = "political_instability"
RSS_URL = "https://travel.state.gov/_res/rss/TAsTWs.xml"
EVENT_URL = (
    "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html"
)
REQUEST_TIMEOUT_SEC = 90
EXPIRE_DAYS = 90
AFFECTED_DIMENSIONS = ["regulatoryEase", "marketSizeAndGrowth"]

FIPS_TO_ISO3: dict[str, str] = {
    "AF": "AFG", "AL": "ALB", "AG": "DZA", "AQ": "ASM", "AN": "AND",
    "AO": "AGO", "AV": "AIA", "AC": "ATG", "AR": "ARG", "AM": "ARM",
    "AS": "AUS", "AU": "AUT", "AJ": "AZE", "BF": "BHS", "BA": "BHR",
    "BG": "BGD", "BB": "BRB", "BO": "BLR", "BE": "BEL", "BH": "BLZ",
    "BN": "BEN", "BT": "BMU", "BL": "BOL", "BK": "BIH", "BC": "BWA",
    "BR": "BRA", "BX": "BRN", "BU": "BGR", "UV": "BFA", "BM": "MMR",
    "BY": "BDI", "CB": "KHM", "CM": "CMR", "CA": "CAN", "CV": "CPV",
    "CT": "CAF", "CD": "TCD", "CI": "CHL", "CH": "CHN", "CO": "COL",
    "CN": "COM", "CG": "COD", "CF": "COG", "CS": "CRI", "IV": "CIV",
    "HR": "HRV", "CU": "CUB", "CY": "CYP", "EZ": "CZE", "DA": "DNK",
    "DJ": "DJI", "DO": "DMA", "DR": "DOM", "EC": "ECU", "EG": "EGY",
    "ES": "SLV", "EK": "GNQ", "ER": "ERI", "EN": "EST", "ET": "ETH",
    "FI": "FIN", "FR": "FRA", "GB": "GAB", "GA": "GMB", "GG": "GEO",
    "GM": "DEU", "GH": "GHA", "GR": "GRC", "GJ": "GRD", "GT": "GTM",
    "GV": "GIN", "PU": "GNB", "GY": "GUY", "HA": "HTI", "HO": "HND",
    "HU": "HUN", "IC": "ISL", "IN": "IND", "ID": "IDN", "IR": "IRN",
    "IZ": "IRQ", "EI": "IRL", "IS": "ISR", "IT": "ITA", "JM": "JAM",
    "JA": "JPN", "JO": "JOR", "KZ": "KAZ", "KE": "KEN", "KN": "PRK",
    "KS": "KOR", "KU": "KWT", "KG": "KGZ", "LA": "LAO", "LG": "LVA",
    "LE": "LBN", "LT": "LSO", "LI": "LBR", "LY": "LBY", "LS": "LIE",
    "LH": "LTU", "LU": "LUX", "MK": "MKD", "MA": "MDG", "MI": "MWI",
    "MY": "MYS", "MV": "MDV", "ML": "MLI", "MT": "MLT", "MR": "MRT",
    "MP": "MUS", "MX": "MEX", "MD": "MDA", "MN": "MCO", "MG": "MNG",
    "MJ": "MNE", "MO": "MAR", "MZ": "MOZ", "WA": "NAM", "NR": "NRU",
    "NP": "NPL", "NL": "NLD", "NZ": "NZL", "NU": "NIC", "NG": "NER",
    "NI": "NGA", "NO": "NOR", "MU": "OMN", "PK": "PAK", "PM": "PAN",
    "PP": "PNG", "PA": "PRY", "PE": "PER", "RP": "PHL", "PL": "POL",
    "PO": "PRT", "QA": "QAT", "RO": "ROU", "RS": "RUS", "RW": "RWA",
    "SC": "KNA", "ST": "LCA", "VC": "VCT", "WS": "WSM", "SM": "SMR",
    "TP": "STP", "SA": "SAU", "SG": "SEN", "RI": "SRB", "SE": "SYC",
    "SL": "SLE", "SN": "SGP", "LO": "SVK", "SI": "SVN", "BP": "SLB",
    "SO": "SOM", "SF": "ZAF", "SP": "ESP", "CE": "LKA", "SU": "SDN",
    "NS": "SUR", "WZ": "SWZ", "SW": "SWE", "SZ": "CHE", "SY": "SYR",
    "TW": "TWN", "TI": "TJK", "TZ": "TZA", "TH": "THA", "TO": "TGO",
    "TN": "TON", "TD": "TTO", "TS": "TUN", "TU": "TUR", "TX": "TKM",
    "UG": "UGA", "UP": "UKR", "AE": "ARE", "UK": "GBR", "US": "USA",
    "UY": "URY", "UZ": "UZB", "NH": "VUT", "VE": "VEN", "VM": "VNM",
    "YM": "YEM", "ZA": "ZMB", "ZI": "ZWE",
    "GW": "GNB", "OD": "SSD",
}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_travel.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_travel")


def parse_level(text: str) -> Optional[int]:
    match = re.search(r"Level\s*([1-4])", text or "", re.I)
    if not match:
        return None
    return int(match.group(1))


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    title: str,
    description: Optional[str],
    severity: int,
    expires_at: datetime,
) -> str:
    cursor.execute(
        """
        SELECT id FROM market_signals
        WHERE source = %s
          AND geography_id = %s
          AND signal_type = %s
        LIMIT 1
        """,
        (SOURCE, geography_id, SIGNAL_TYPE),
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """
            UPDATE market_signals
            SET title = %s,
                description = %s,
                severity = %s,
                direction = 'negative',
                affected_dimensions = %s,
                probability = NULL,
                event_url = %s,
                expires_at = %s,
                resolved = false,
                fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                title,
                description,
                severity,
                AFFECTED_DIMENSIONS,
                EVENT_URL,
                expires_at,
                existing[0],
            ),
        )
        return "update"

    cursor.execute(
        """
        INSERT INTO market_signals (
            geography_id, source, signal_type, title, description,
            probability, severity, direction, affected_dimensions,
            event_url, resolved, expires_at, fetched_at, created_at, updated_at
        )
        VALUES (
            %s, %s, %s, %s, %s,
            NULL, %s, 'negative', %s,
            %s, false, %s, NOW(), NOW(), NOW()
        )
        """,
        (
            geography_id,
            SOURCE,
            SIGNAL_TYPE,
            title,
            description,
            severity,
            AFFECTED_DIMENSIONS,
            EVENT_URL,
            expires_at,
        ),
    )
    return "insert"


def ingest() -> None:
    response = requests.get(
        RSS_URL,
        headers={"User-Agent": "gexis-mvp/1.0", "Accept": "application/rss+xml, text/xml"},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)
    items = root.findall(".//item")
    logger.info("Parsed %s travel advisory RSS items", len(items))

    # Keep highest level per ISO3 if duplicates
    by_iso: dict[str, dict] = {}
    skipped_fips = 0
    skipped_level = 0

    for item in items:
        title = (item.findtext("title") or "").strip()
        description = (item.findtext("description") or "").strip()
        fips = None
        level_text = ""
        for cat in item.findall("category"):
            domain = (cat.get("domain") or "").strip()
            text = (cat.text or "").strip()
            if domain == "Country-Tag":
                fips = text.upper()
            elif domain == "Threat-Level":
                level_text = text
        level = parse_level(level_text) or parse_level(title)
        if level is None or level < 3:
            skipped_level += 1
            continue
        if not fips:
            skipped_fips += 1
            continue
        iso3 = FIPS_TO_ISO3.get(fips)
        if not iso3:
            logger.warning("Unmapped FIPS country tag %s (%s)", fips, title[:80])
            skipped_fips += 1
            continue
        existing = by_iso.get(iso3)
        if existing and existing["level"] >= level:
            continue
        by_iso[iso3] = {
            "level": level,
            "title": title,
            "description": description[:500] if description else None,
        }

    logger.info(
        "Level 3/4 advisories for %s countries (skipped_level=%s skipped_fips=%s)",
        len(by_iso),
        skipped_level,
        skipped_fips,
    )

    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    inserted = updated = skipped_geo = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for iso3, meta in by_iso.items():
            geography_id = iso_map.get(iso3)
            if not geography_id:
                skipped_geo += 1
                continue
            level = meta["level"]
            severity = 5 if level >= 4 else 4
            signal_title = f"US State Dept: Level {level} advisory — {meta['title']}"
            if len(signal_title) > 240:
                signal_title = signal_title[:237] + "..."
            action = upsert_signal(
                cursor,
                geography_id=geography_id,
                title=signal_title,
                description=meta["description"],
                severity=severity,
                expires_at=expires_at,
            )
            if action == "insert":
                inserted += 1
            else:
                updated += 1

    logger.info(
        "Done inserted=%s updated=%s skipped_geo=%s",
        inserted,
        updated,
        skipped_geo,
    )
    trigger_signal_notifications()
    logger.info("ingest_travel completed successfully")


def main() -> None:
    configure_logging()
    try:
        ingest()
    except Exception:
        logger.exception("ingest_travel failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
