"""
Ingest NewsAPI topic articles into market_signals (Layer 2).

Auth: NEWSAPI_KEY in repo-root .env
Runs exactly 8 topic queries per execution (~8 requests/day).
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications
from signal_common import extract_iso_codes, has_negative_keyword

SOURCE = "newsapi"
API_URL = "https://newsapi.org/v2/everything"
REQUEST_TIMEOUT_SEC = 60
EXPIRE_DAYS = 14
PAGE_SIZE = 20
QUERY_DELAY_SEC = 1.0
DEFAULT_SEVERITY = 3

NEWSAPI_QUERIES: list[dict[str, Any]] = [
    {
        "q": '"trade tariff" OR "import duty" OR "tariff increase"',
        "signal_type": "tariff_risk",
        "direction": "negative",
        "dims": ["taxEnvironment", "competitorSaturation"],
    },
    {
        "q": '"economic sanctions" OR "trade embargo" OR "sanctions imposed"',
        "signal_type": "sanctions",
        "direction": "negative",
        "dims": ["regulatoryEase", "marketSizeAndGrowth"],
    },
    {
        "q": '"trade agreement" OR "free trade deal" OR "trade pact signed"',
        "signal_type": "trade_agreement",
        "direction": "positive",
        "dims": ["marketSizeAndGrowth", "competitorSaturation"],
    },
    {
        "q": '"new regulation" OR "regulatory reform" OR "deregulation"',
        "signal_type": "regulatory_change",
        "direction": "neutral",
        "dims": ["regulatoryEase"],
    },
    {
        "q": '"political crisis" OR "coup" OR "civil unrest" OR "mass protest"',
        "signal_type": "political_instability",
        "direction": "negative",
        "dims": ["regulatoryEase"],
    },
    {
        "q": '"currency devaluation" OR "currency crisis" OR "hyperinflation"',
        "signal_type": "currency_crisis",
        "direction": "negative",
        "dims": ["taxEnvironment", "marketSizeAndGrowth"],
    },
    {
        "q": (
            '"natural disaster" OR "earthquake damage" OR '
            '"hurricane landfall" OR "major flooding"'
        ),
        "signal_type": "natural_disaster",
        "direction": "negative",
        "dims": ["infrastructure", "marketSizeAndGrowth"],
    },
    {
        "q": (
            '"labor strike" OR "workers strike" OR '
            '"general strike" OR "labor unrest"'
        ),
        "signal_type": "labor_unrest",
        "direction": "negative",
        "dims": ["talentDensity", "competitorSaturation"],
    },
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_newsapi.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_newsapi")


def fetch_articles(api_key: str, query: str) -> list[dict[str, Any]]:
    response = requests.get(
        API_URL,
        params={
            "q": query,
            "language": "en",
            "sortBy": "relevancy",
            "pageSize": PAGE_SIZE,
            "apiKey": api_key,
        },
        timeout=REQUEST_TIMEOUT_SEC,
    )
    if response.status_code == 401:
        raise RuntimeError(f"NewsAPI auth failed: {response.text[:300]}")
    if response.status_code == 429:
        logger.warning("NewsAPI rate limited: %s", response.text[:300])
        return []
    response.raise_for_status()
    payload = response.json()
    articles = payload.get("articles") or []
    return [a for a in articles if isinstance(a, dict)]


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    signal_type: str,
    title: str,
    description: Optional[str],
    direction: str,
    affected_dimensions: list[str],
    event_url: Optional[str],
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
        (SOURCE, geography_id, signal_type),
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """
            UPDATE market_signals
            SET title = %s,
                description = %s,
                severity = %s,
                direction = %s,
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
                DEFAULT_SEVERITY,
                direction,
                affected_dimensions,
                event_url,
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
            NULL, %s, %s, %s,
            %s, false, %s, NOW(), NOW(), NOW()
        )
        """,
        (
            geography_id,
            SOURCE,
            signal_type,
            title,
            description,
            DEFAULT_SEVERITY,
            direction,
            affected_dimensions,
            event_url,
            expires_at,
        ),
    )
    return "insert"


def ingest() -> None:
    api_key = (os.getenv("NEWSAPI_KEY") or "").strip()
    if not api_key:
        logger.error("NEWSAPI_KEY not set in environment (.env). Aborting.")
        sys.exit(1)

    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    # Dedup key: (signal_type, iso3) -> best article meta
    buckets: dict[tuple[str, str], dict[str, Any]] = {}

    for i, cfg in enumerate(NEWSAPI_QUERIES):
        if i > 0:
            time.sleep(QUERY_DELAY_SEC)
        q = str(cfg["q"])
        signal_type = str(cfg["signal_type"])
        direction = str(cfg["direction"])
        dims = list(cfg["dims"])
        try:
            articles = fetch_articles(api_key, q)
        except Exception:
            logger.exception("NewsAPI query failed for signal_type=%s", signal_type)
            continue
        logger.info(
            "NewsAPI query %s/%s signal_type=%s -> %s articles",
            i + 1,
            len(NEWSAPI_QUERIES),
            signal_type,
            len(articles),
        )
        for article in articles:
            title = str(article.get("title") or "").strip()
            description = str(article.get("description") or "").strip()
            text = f"{title} {description}".strip()
            if not text:
                continue
            # has_negative_keyword filters noise (sports/entertainment), not sentiment
            if has_negative_keyword(text):
                continue
            isos = extract_iso_codes(text, default_usa_on_us_topic=True)
            if not isos:
                continue
            url = article.get("url")
            event_url = str(url) if url else None
            desc = description[:500] if description else None
            short_title = title[:200] if title else signal_type
            for iso3 in isos:
                key = (signal_type, iso3)
                if key in buckets:
                    continue
                buckets[key] = {
                    "title": short_title,
                    "description": desc,
                    "direction": direction,
                    "dims": dims,
                    "event_url": event_url,
                }

    logger.info("Deduped to %s country/type news signals", len(buckets))
    inserted = updated = skipped_geo = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for (signal_type, iso3), meta in buckets.items():
            geography_id = iso_map.get(iso3)
            if not geography_id:
                skipped_geo += 1
                continue
            action = upsert_signal(
                cursor,
                geography_id=geography_id,
                signal_type=signal_type,
                title=meta["title"],
                description=meta["description"],
                direction=meta["direction"],
                affected_dimensions=meta["dims"],
                event_url=meta["event_url"],
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
    logger.info("ingest_newsapi completed successfully")


def main() -> None:
    configure_logging()
    try:
        ingest()
    except Exception:
        logger.exception("ingest_newsapi failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
