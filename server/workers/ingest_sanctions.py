"""
Ingest OpenSanctions entity counts into market_signals (Layer 2).

Bulk CSV (~64 MB):
https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv
Cached under server/workers/data/opensanctions_latest.csv
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

from config import DATA_DIR, LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications

SOURCE = "opensanctions"
SIGNAL_TYPE = "sanctions"
CSV_URL = (
    "https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv"
)
CACHE_PATH = DATA_DIR / "opensanctions_latest.csv"
EVENT_URL = "https://www.opensanctions.org/datasets/sanctions/"
REQUEST_TIMEOUT_SEC = 300
MIN_ENTITIES = 10
EXPIRE_DAYS = 30
AFFECTED_DIMENSIONS = ["regulatoryEase", "marketSizeAndGrowth"]

# ISO 3166-1 alpha-2 → alpha-3 (stable; no pycountry dependency)
ISO2_TO_ISO3: dict[str, str] = {
    "AF": "AFG", "AX": "ALA", "AL": "ALB", "DZ": "DZA", "AS": "ASM", "AD": "AND",
    "AO": "AGO", "AI": "AIA", "AQ": "ATA", "AG": "ATG", "AR": "ARG", "AM": "ARM",
    "AW": "ABW", "AU": "AUS", "AT": "AUT", "AZ": "AZE", "BS": "BHS", "BH": "BHR",
    "BD": "BGD", "BB": "BRB", "BY": "BLR", "BE": "BEL", "BZ": "BLZ", "BJ": "BEN",
    "BM": "BMU", "BT": "BTN", "BO": "BOL", "BQ": "BES", "BA": "BIH", "BW": "BWA",
    "BV": "BVT", "BR": "BRA", "IO": "IOT", "BN": "BRN", "BG": "BGR", "BF": "BFA",
    "BI": "BDI", "CV": "CPV", "KH": "KHM", "CM": "CMR", "CA": "CAN", "KY": "CYM",
    "CF": "CAF", "TD": "TCD", "CL": "CHL", "CN": "CHN", "CX": "CXR", "CC": "CCK",
    "CO": "COL", "KM": "COM", "CG": "COG", "CD": "COD", "CK": "COK", "CR": "CRI",
    "CI": "CIV", "HR": "HRV", "CU": "CUB", "CW": "CUW", "CY": "CYP", "CZ": "CZE",
    "DK": "DNK", "DJ": "DJI", "DM": "DMA", "DO": "DOM", "EC": "ECU", "EG": "EGY",
    "SV": "SLV", "GQ": "GNQ", "ER": "ERI", "EE": "EST", "SZ": "SWZ", "ET": "ETH",
    "FK": "FLK", "FO": "FRO", "FJ": "FJI", "FI": "FIN", "FR": "FRA", "GF": "GUF",
    "PF": "PYF", "TF": "ATF", "GA": "GAB", "GM": "GMB", "GE": "GEO", "DE": "DEU",
    "GH": "GHA", "GI": "GIB", "GR": "GRC", "GL": "GRL", "GD": "GRD", "GP": "GLP",
    "GU": "GUM", "GT": "GTM", "GG": "GGY", "GN": "GIN", "GW": "GNB", "GY": "GUY",
    "HT": "HTI", "HM": "HMD", "VA": "VAT", "HN": "HND", "HK": "HKG", "HU": "HUN",
    "IS": "ISL", "IN": "IND", "ID": "IDN", "IR": "IRN", "IQ": "IRQ", "IE": "IRL",
    "IM": "IMN", "IL": "ISR", "IT": "ITA", "JM": "JAM", "JP": "JPN", "JE": "JEY",
    "JO": "JOR", "KZ": "KAZ", "KE": "KEN", "KI": "KIR", "KP": "PRK", "KR": "KOR",
    "KW": "KWT", "KG": "KGZ", "LA": "LAO", "LV": "LVA", "LB": "LBN", "LS": "LSO",
    "LR": "LBR", "LY": "LBY", "LI": "LIE", "LT": "LTU", "LU": "LUX", "MO": "MAC",
    "MG": "MDG", "MW": "MWI", "MY": "MYS", "MV": "MDV", "ML": "MLI", "MT": "MLT",
    "MH": "MHL", "MQ": "MTQ", "MR": "MRT", "MU": "MUS", "YT": "MYT", "MX": "MEX",
    "FM": "FSM", "MD": "MDA", "MC": "MCO", "MN": "MNG", "ME": "MNE", "MS": "MSR",
    "MA": "MAR", "MZ": "MOZ", "MM": "MMR", "NA": "NAM", "NR": "NRU", "NP": "NPL",
    "NL": "NLD", "NC": "NCL", "NZ": "NZL", "NI": "NIC", "NE": "NER", "NG": "NGA",
    "NU": "NIU", "NF": "NFK", "MK": "MKD", "MP": "MNP", "NO": "NOR", "OM": "OMN",
    "PK": "PAK", "PW": "PLW", "PS": "PSE", "PA": "PAN", "PG": "PNG", "PY": "PRY",
    "PE": "PER", "PH": "PHL", "PN": "PCN", "PL": "POL", "PT": "PRT", "PR": "PRI",
    "QA": "QAT", "RE": "REU", "RO": "ROU", "RU": "RUS", "RW": "RWA", "BL": "BLM",
    "SH": "SHN", "KN": "KNA", "LC": "LCA", "MF": "MAF", "PM": "SPM", "VC": "VCT",
    "WS": "WSM", "SM": "SMR", "ST": "STP", "SA": "SAU", "SN": "SEN", "RS": "SRB",
    "SC": "SYC", "SL": "SLE", "SG": "SGP", "SX": "SXM", "SK": "SVK", "SI": "SVN",
    "SB": "SLB", "SO": "SOM", "ZA": "ZAF", "GS": "SGS", "SS": "SSD", "ES": "ESP",
    "LK": "LKA", "SD": "SDN", "SR": "SUR", "SJ": "SJM", "SE": "SWE", "CH": "CHE",
    "SY": "SYR", "TW": "TWN", "TJ": "TJK", "TZ": "TZA", "TH": "THA", "TL": "TLS",
    "TG": "TGO", "TK": "TKL", "TO": "TON", "TT": "TTO", "TN": "TUN", "TR": "TUR",
    "TM": "TKM", "TC": "TCA", "TV": "TUV", "UG": "UGA", "UA": "UKR", "AE": "ARE",
    "GB": "GBR", "US": "USA", "UM": "UMI", "UY": "URY", "UZ": "UZB", "VU": "VUT",
    "VE": "VEN", "VN": "VNM", "VG": "VGB", "VI": "VIR", "WF": "WLF", "EH": "ESH",
    "YE": "YEM", "ZM": "ZMB", "ZW": "ZWE", "XK": "XKX",
}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_sanctions.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_sanctions")


def download_csv(path: Path) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading OpenSanctions CSV -> %s", path)
    with requests.get(CSV_URL, stream=True, timeout=REQUEST_TIMEOUT_SEC) as response:
        response.raise_for_status()
        with path.open("wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    fh.write(chunk)
    size_mb = path.stat().st_size / (1024 * 1024)
    logger.info("Downloaded %.1f MB", size_mb)
    return path


def severity_from_count(count: int) -> int:
    if count >= 500:
        return 5
    if count >= 100:
        return 4
    if count >= 50:
        return 3
    if count >= 25:
        return 2
    return 1


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
    path = download_csv(CACHE_PATH)
    logger.info("Parsing OpenSanctions CSV with pandas")
    df = pd.read_csv(path, dtype=str, low_memory=False)
    if "countries" not in df.columns:
        raise RuntimeError(f"Missing countries column; got {list(df.columns)}")

    # iso3 -> {count, programs set, name guess}
    counts: dict[str, int] = defaultdict(int)
    programs: dict[str, set[str]] = defaultdict(set)
    skipped_iso = 0

    for _, row in df.iterrows():
        countries_raw = str(row.get("countries") or "").strip()
        if not countries_raw or countries_raw.lower() == "nan":
            continue
        dataset = str(row.get("dataset") or "").strip()
        parts = [p.strip().lower() for p in countries_raw.replace(";", ",").split(",")]
        for part in parts:
            if not part or len(part) != 2:
                if part:
                    skipped_iso += 1
                continue
            iso3 = ISO2_TO_ISO3.get(part.upper())
            if not iso3:
                skipped_iso += 1
                continue
            counts[iso3] += 1
            if dataset:
                programs[iso3].add(dataset)

    logger.info(
        "Aggregated %s countries with entities (skipped_iso_tokens=%s)",
        len(counts),
        skipped_iso,
    )

    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    inserted = updated = skipped_geo = skipped_low = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        cursor.execute(
            """
            SELECT iso_code, name FROM geographies
            WHERE region_type = 'country' AND iso_code IS NOT NULL
            """
        )
        name_map = {row[0].upper(): row[1] for row in cursor.fetchall()}

        for iso3, count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
            if count < MIN_ENTITIES:
                skipped_low += 1
                continue
            geography_id = iso_map.get(iso3)
            if not geography_id:
                skipped_geo += 1
                continue
            program_count = len(programs.get(iso3) or [])
            country_name = name_map.get(iso3, iso3)
            title = (
                f"{count} sanctioned entities targeting {country_name} "
                f"across {program_count} programs"
            )
            description = f"OpenSanctions consolidated list; entity_count={count}"
            severity = severity_from_count(count)
            action = upsert_signal(
                cursor,
                geography_id=geography_id,
                title=title,
                description=description,
                severity=severity,
                expires_at=expires_at,
            )
            if action == "insert":
                inserted += 1
            else:
                updated += 1

    logger.info(
        "Done inserted=%s updated=%s skipped_geo=%s skipped_low=%s",
        inserted,
        updated,
        skipped_geo,
        skipped_low,
    )
    trigger_signal_notifications()
    logger.info("ingest_sanctions completed successfully")


def main() -> None:
    configure_logging()
    try:
        ingest()
    except Exception:
        logger.exception("ingest_sanctions failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
