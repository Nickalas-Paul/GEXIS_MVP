"""
Seed country-level geographies from Natural Earth 1:110m Admin-0.

Usage (from server/workers):
    python seed_geographies.py
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import requests

from config import DATA_DIR, LOGS_DIR
from db import get_cursor, upsert_geography

NATURAL_EARTH_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_110m_admin_0_countries.geojson"
)
CACHE_FILE = DATA_DIR / "ne_110m_admin_0_countries.geojson"

INVALID_ISO_VALUES = {"", "-99", "NULL", "N/A", "NA", "NONE"}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "seed_geographies.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


logger = logging.getLogger("seed_geographies")


def download_or_load_geojson() -> dict:
    if CACHE_FILE.exists() and CACHE_FILE.stat().st_size > 0:
        logger.info("Using cached GeoJSON: %s", CACHE_FILE)
        with CACHE_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    logger.info("Downloading Natural Earth countries from %s", NATURAL_EARTH_URL)
    response = requests.get(NATURAL_EARTH_URL, timeout=120)
    response.raise_for_status()
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_bytes(response.content)
    logger.info("Cached download to %s (%s bytes)", CACHE_FILE, len(response.content))
    return response.json()


def normalize_iso_a3(raw: object) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip().upper()
    if value in INVALID_ISO_VALUES or len(value) != 3 or not value.isalpha():
        return None
    return value


def parse_population(props: dict) -> int | None:
    raw = props.get("POP_EST")
    if raw is None or raw == "" or raw == -99:
        return None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def feature_to_geography(feature: dict) -> dict | None:
    props = feature.get("properties") or {}
    geometry = feature.get("geometry")
    if not geometry:
        logger.warning("Skipping feature with no geometry: %s", props.get("NAME"))
        return None

    iso_code = normalize_iso_a3(props.get("ISO_A3_EH") or props.get("ISO_A3"))
    if not iso_code:
        logger.warning(
            "Skipping feature without valid ISO A3: name=%s ISO_A3=%s ISO_A3_EH=%s",
            props.get("NAME") or props.get("ADMIN"),
            props.get("ISO_A3"),
            props.get("ISO_A3_EH"),
        )
        return None

    name = (
        props.get("NAME_LONG")
        or props.get("ADMIN")
        or props.get("NAME")
        or iso_code
    )

    # Natural Earth exposes GDP_MD (millions USD market), not PPP — leave gdp_ppp NULL.
    return {
        "name": str(name),
        "iso_code": iso_code,
        "region_type": "country",
        "parent_geography_id": None,
        "geometry": geometry,
        "population": parse_population(props),
        "gdp_ppp": None,
    }


def seed() -> None:
    data = download_or_load_geojson()
    features = data.get("features") or []
    logger.info("Parsed %s features from Natural Earth", len(features))

    upserted = 0
    skipped = 0

    with get_cursor() as cursor:
        for feature in features:
            geography = feature_to_geography(feature)
            if geography is None:
                skipped += 1
                continue
            upsert_geography(cursor, geography)
            upserted += 1

        cursor.execute(
            """
            SELECT count(*) AS total, region_type
            FROM geographies
            GROUP BY region_type
            ORDER BY region_type
            """
        )
        counts = cursor.fetchall()

    logger.info("Upserted=%s skipped=%s", upserted, skipped)
    for total, region_type in counts:
        logger.info("Final count region_type=%s total=%s", region_type, total)


if __name__ == "__main__":
    configure_logging()
    try:
        seed()
        logger.info("seed_geographies completed successfully")
    except Exception:
        logger.exception("seed_geographies failed")
        sys.exit(1)
