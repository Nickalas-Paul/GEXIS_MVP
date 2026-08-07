"""Database helpers for GEXIS data workers."""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from typing import Any, Generator, Iterator

from psycopg2.extensions import connection as PgConnection
from psycopg2.extensions import cursor as PgCursor

from config import get_db_connection

logger = logging.getLogger(__name__)


@contextmanager
def get_connection() -> Generator[PgConnection, None, None]:
    """Yield a psycopg2 connection with autocommit off."""
    conn = get_db_connection()
    conn.autocommit = False
    logger.debug("Acquired DB connection (autocommit=off)")
    try:
        yield conn
    finally:
        conn.close()
        logger.debug("Closed DB connection")


@contextmanager
def get_cursor() -> Iterator[PgCursor]:
    """Yield a cursor; commit on success, roll back on exception."""
    with get_connection() as conn:
        cur = conn.cursor()
        logger.debug("Opened DB cursor")
        try:
            yield cur
            conn.commit()
            logger.debug("Committed transaction")
        except Exception:
            conn.rollback()
            logger.exception("Rolled back transaction due to error")
            raise
        finally:
            cur.close()
            logger.debug("Closed DB cursor")


def upsert_geography(cursor: PgCursor, geography: dict[str, Any]) -> None:
    """
    Insert or update a geography row on (iso_code, region_type).

    Expects keys: name, iso_code, region_type, geometry (GeoJSON dict or str),
    and optional population, gdp_ppp, parent_geography_id, region_label,
    currency_code, language_primary.
    Centroid and bbox are computed in SQL via PostGIS.
    """
    iso_code = geography["iso_code"]
    region_type = geography["region_type"]
    name = geography["name"]
    geometry = geography["geometry"]
    if not isinstance(geometry, str):
        geometry = json.dumps(geometry)

    logger.info(
        "Upserting geography iso_code=%s region_type=%s name=%s",
        iso_code,
        region_type,
        name,
    )

    cursor.execute(
        """
        WITH g AS (
            SELECT ST_Multi(
                ST_CollectionExtract(
                    ST_MakeValid(
                        ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326)
                    ),
                    3
                )
            ) AS geom
        )
        INSERT INTO geographies (
            name,
            iso_code,
            region_type,
            parent_geography_id,
            region_label,
            geometry,
            centroid,
            bbox,
            population,
            gdp_ppp,
            currency_code,
            language_primary,
            updated_at
        )
        SELECT
            %(name)s,
            %(iso_code)s,
            %(region_type)s,
            %(parent_geography_id)s,
            %(region_label)s,
            g.geom,
            ST_Centroid(g.geom),
            Box2D(g.geom),
            %(population)s,
            %(gdp_ppp)s,
            %(currency_code)s,
            %(language_primary)s,
            NOW()
        FROM g
        ON CONFLICT (iso_code, region_type) WHERE (iso_code IS NOT NULL)
        DO UPDATE SET
            name = EXCLUDED.name,
            parent_geography_id = EXCLUDED.parent_geography_id,
            region_label = EXCLUDED.region_label,
            geometry = EXCLUDED.geometry,
            centroid = EXCLUDED.centroid,
            bbox = EXCLUDED.bbox,
            population = EXCLUDED.population,
            gdp_ppp = EXCLUDED.gdp_ppp,
            currency_code = EXCLUDED.currency_code,
            language_primary = EXCLUDED.language_primary,
            updated_at = NOW()
        """,
        {
            "name": name,
            "iso_code": iso_code,
            "region_type": region_type,
            "parent_geography_id": geography.get("parent_geography_id"),
            "region_label": geography.get("region_label"),
            "geometry": geometry,
            "population": geography.get("population"),
            "gdp_ppp": geography.get("gdp_ppp"),
            "currency_code": geography.get("currency_code"),
            "language_primary": geography.get("language_primary"),
        },
    )


def load_geography_iso_map(cursor: PgCursor) -> dict[str, str]:
    """Return {iso_code_upper: geography_id} for region_type='country'."""
    cursor.execute(
        """
        SELECT iso_code, id::text
        FROM geographies
        WHERE region_type = 'country' AND iso_code IS NOT NULL
        """
    )
    mapping = {row[0].upper(): row[1] for row in cursor.fetchall()}
    logger.info("Loaded %s country geography ISO mappings", len(mapping))
    return mapping


def load_geography_name_map(cursor: PgCursor) -> dict[str, str]:
    """Return {normalized_name: geography_id} for country geographies."""
    cursor.execute(
        """
        SELECT name, id::text, iso_code
        FROM geographies
        WHERE region_type = 'country'
        """
    )
    mapping: dict[str, str] = {}
    for name, geo_id, iso_code in cursor.fetchall():
        mapping[normalize_country_name(name)] = geo_id
        if iso_code:
            mapping[normalize_country_name(iso_code)] = geo_id
    logger.info("Loaded %s country geography name mappings", len(mapping))
    return mapping


def normalize_country_name(name: str) -> str:
    """Normalize a country name for fuzzy matching."""
    text = (name or "").strip().lower()
    for ch in [",", ".", "'", '"', "(", ")", "/", "-"]:
        text = text.replace(ch, " ")
    return " ".join(text.split())


def upsert_indicator(
    cursor: PgCursor,
    geography_id: str,
    source: str,
    indicator_code: str,
    indicator_name: str,
    value: Any,
    unit: str | None,
    year: int,
    data_url: str | None = None,
) -> None:
    """Upsert a raw indicator value. Idempotent on (geography_id, source, indicator_code, year)."""
    logger.debug(
        "Upserting indicator source=%s code=%s year=%s geography_id=%s value=%s",
        source,
        indicator_code,
        year,
        geography_id,
        value,
    )
    cursor.execute(
        """
        INSERT INTO raw_indicators (
            geography_id,
            source,
            indicator_code,
            indicator_name,
            value,
            unit,
            year,
            fetched_at,
            data_url
        )
        VALUES (
            %(geography_id)s,
            %(source)s,
            %(indicator_code)s,
            %(indicator_name)s,
            %(value)s,
            %(unit)s,
            %(year)s,
            NOW(),
            %(data_url)s
        )
        ON CONFLICT (geography_id, source, indicator_code, year)
        DO UPDATE SET
            indicator_name = EXCLUDED.indicator_name,
            value = EXCLUDED.value,
            unit = EXCLUDED.unit,
            fetched_at = NOW(),
            data_url = EXCLUDED.data_url
        """,
        {
            "geography_id": geography_id,
            "source": source,
            "indicator_code": indicator_code,
            "indicator_name": indicator_name,
            "value": value,
            "unit": unit,
            "year": year,
            "data_url": data_url,
        },
    )
