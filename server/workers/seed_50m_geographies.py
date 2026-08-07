"""
Insert small-area sovereign states missing from the 1:110m Natural Earth seed.

Downloads Natural Earth 1:50m Admin-0 countries, then inserts only countries
that are not already present in geographies (e.g. Singapore).

Usage (from server/workers):
    python seed_50m_geographies.py
"""

from __future__ import annotations

import logging
import sys
import zipfile
from pathlib import Path

import requests
import shapefile

from config import DATA_DIR, LOGS_DIR
from db import get_cursor, upsert_geography

NATURAL_EARTH_ZIP_URL = (
    "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip"
)
ZIP_CACHE = DATA_DIR / "ne_50m_admin_0_countries.zip"
EXTRACT_DIR = DATA_DIR / "ne_50m_admin_0_countries"
INVALID_ISO_VALUES = {"", "-99", "NULL", "N/A", "NA", "NONE"}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "seed_50m_geographies.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


logger = logging.getLogger("seed_50m_geographies")


def download_or_load_zip() -> Path:
    if ZIP_CACHE.exists() and ZIP_CACHE.stat().st_size > 0:
        logger.info("Using cached zip: %s", ZIP_CACHE)
    else:
        logger.info("Downloading Natural Earth 50m countries from %s", NATURAL_EARTH_ZIP_URL)
        response = requests.get(NATURAL_EARTH_ZIP_URL, timeout=180)
        response.raise_for_status()
        ZIP_CACHE.parent.mkdir(parents=True, exist_ok=True)
        ZIP_CACHE.write_bytes(response.content)
        logger.info("Cached download to %s (%s bytes)", ZIP_CACHE, len(response.content))

    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    shp_candidates = list(EXTRACT_DIR.rglob("ne_50m_admin_0_countries.shp"))
    if not shp_candidates:
        logger.info("Extracting zip to %s", EXTRACT_DIR)
        with zipfile.ZipFile(ZIP_CACHE, "r") as zf:
            zf.extractall(EXTRACT_DIR)
        shp_candidates = list(EXTRACT_DIR.rglob("ne_50m_admin_0_countries.shp"))

    if not shp_candidates:
        raise FileNotFoundError(
            f"ne_50m_admin_0_countries.shp not found under {EXTRACT_DIR}"
        )
    return shp_candidates[0]


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


def load_existing_iso_codes(cursor) -> set[str]:
    cursor.execute(
        """
        SELECT iso_code
        FROM geographies
        WHERE region_type = 'country' AND iso_code IS NOT NULL
        """
    )
    return {row[0].upper() for row in cursor.fetchall()}


def iter_50m_features(shp_path: Path):
    # Natural Earth .cpg often says utf-8, but Admin-0 DBF text is latin-1.
    reader = shapefile.Reader(str(shp_path), encoding="latin-1")
    field_names = [field[0] for field in reader.fields[1:]]
    for sr in reader.shapeRecords():
        props = dict(zip(field_names, sr.record))
        geometry = sr.shape.__geo_interface__
        yield props, geometry


def feature_to_geography(props: dict, geometry: dict) -> dict | None:
    if not geometry:
        logger.warning("Skipping feature with no geometry: %s", props.get("NAME"))
        return None

    sov_a3 = str(props.get("SOV_A3") or "").strip().upper()
    adm0_a3 = str(props.get("ADM0_A3") or "").strip().upper()
    if not sov_a3 or not adm0_a3 or sov_a3 != adm0_a3:
        return None

    iso_code = normalize_iso_a3(props.get("ISO_A3_EH") or props.get("ISO_A3"))
    if not iso_code:
        return None

    name = (
        props.get("NAME_LONG")
        or props.get("ADMIN")
        or props.get("NAME")
        or iso_code
    )

    return {
        "name": str(name),
        "iso_code": iso_code,
        "region_type": "country",
        "parent_geography_id": None,
        "region_label": None,
        "geometry": geometry,
        "population": parse_population(props),
        "gdp_ppp": None,
    }


def seed() -> None:
    shp_path = download_or_load_zip()
    logger.info("Reading shapefile: %s", shp_path)

    inserted: list[tuple[str, str]] = []
    skipped_existing: list[str] = []
    skipped_filter = 0

    with get_cursor() as cursor:
        existing = load_existing_iso_codes(cursor)
        logger.info("Existing country ISO codes in DB: %s", len(existing))

        for props, geometry in iter_50m_features(shp_path):
            geography = feature_to_geography(props, geometry)
            if geography is None:
                skipped_filter += 1
                continue

            iso_code = geography["iso_code"]
            if iso_code in existing:
                skipped_existing.append(iso_code)
                logger.debug("Skipped (already exists): %s %s", iso_code, geography["name"])
                continue

            upsert_geography(cursor, geography)
            existing.add(iso_code)
            inserted.append((iso_code, geography["name"]))
            logger.info("Inserted: %s %s", iso_code, geography["name"])

        cursor.execute("SELECT COUNT(*) FROM geographies")
        total = cursor.fetchone()[0]

    logger.info(
        "Inserted=%s skipped_existing=%s skipped_filter=%s total_geographies=%s",
        len(inserted),
        len(skipped_existing),
        skipped_filter,
        total,
    )
    if skipped_existing:
        unique_skipped = sorted(set(skipped_existing))
        logger.info(
            "Skipped already-existing ISO codes (%s): %s",
            len(unique_skipped),
            ", ".join(unique_skipped),
        )
    if inserted:
        logger.info(
            "Newly inserted countries: %s",
            ", ".join(f"{iso} ({name})" for iso, name in sorted(inserted)),
        )


if __name__ == "__main__":
    configure_logging()
    try:
        seed()
        logger.info("seed_50m_geographies completed successfully")
    except Exception:
        logger.exception("seed_50m_geographies failed")
        sys.exit(1)
