"""
Ingest GDACS natural-disaster events into market_signals (Layer 2).

API: GeoJSON FeatureCollection (no auth)
https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications

SOURCE = "gdacs"
SIGNAL_TYPE = "natural_disaster"
EVENT_URL = "https://www.gdacs.org/"
REQUEST_TIMEOUT_SEC = 90
WINDOW_DAYS = 30
EXPIRE_DAYS = 14
AFFECTED_DIMENSIONS = ["infrastructure", "marketSizeAndGrowth"]

EVENT_TYPE_LABELS = {
    "EQ": "earthquake",
    "FL": "flood",
    "TC": "tropical cyclone",
    "VO": "volcanic",
    "WF": "wildfire",
    "DR": "drought",
}

ALERT_SEVERITY = {"red": 5, "orange": 4, "green": 2}
ALERT_RANK = {"red": 3, "orange": 2, "green": 1}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_gdacs.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_gdacs")


def fetch_events(start: date, end: date) -> list[dict[str, Any]]:
    url = (
        "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
        f"?eventlist=EQ;FL;TC;VO;WF;DR"
        f"&fromdate={start.isoformat()}&todate={end.isoformat()}"
        f"&alertlevel=green;orange;red"
    )
    response = requests.get(
        url,
        headers={"Accept": "application/json", "User-Agent": "gexis-mvp/1.0"},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    features = payload.get("features") if isinstance(payload, dict) else None
    if not isinstance(features, list):
        raise RuntimeError(f"Unexpected GDACS payload keys: {list(payload)[:20]}")
    return [f for f in features if isinstance(f, dict)]


def alert_level(props: dict[str, Any]) -> str:
    raw = str(props.get("alertlevel") or props.get("episodealertlevel") or "green")
    return raw.strip().lower()


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
    today = date.today()
    start = today - timedelta(days=WINDOW_DAYS)
    features = fetch_events(start, today)
    logger.info("Fetched %s GDACS features for %s .. %s", len(features), start, today)

    # iso3 -> eventtype -> {count, max_alert, country}
    buckets: dict[str, dict[str, dict[str, Any]]] = defaultdict(
        lambda: defaultdict(lambda: {"count": 0, "max_alert": "green", "country": ""})
    )
    skipped_no_iso = 0

    for feature in features:
        props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        iso3 = str(props.get("iso3") or "").strip().upper()
        if not iso3 or len(iso3) != 3:
            skipped_no_iso += 1
            continue
        event_type = str(props.get("eventtype") or "").strip().upper()
        if event_type not in EVENT_TYPE_LABELS:
            continue
        level = alert_level(props)
        if level not in ALERT_RANK:
            level = "green"
        bucket = buckets[iso3][event_type]
        bucket["count"] += 1
        if ALERT_RANK[level] > ALERT_RANK[bucket["max_alert"]]:
            bucket["max_alert"] = level
        country = str(props.get("country") or iso3).strip()
        if country:
            bucket["country"] = country

    logger.info(
        "Aggregated %s countries (%s skipped missing iso3)",
        len(buckets),
        skipped_no_iso,
    )

    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    inserted = updated = skipped_geo = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for iso3, by_type in buckets.items():
            geography_id = iso_map.get(iso3)
            if not geography_id:
                skipped_geo += 1
                continue

            # Dominant type: highest alert, then highest count
            dominant_type = max(
                by_type.items(),
                key=lambda kv: (ALERT_RANK[kv[1]["max_alert"]], kv[1]["count"]),
            )[0]
            dominant = by_type[dominant_type]
            country_highest = max(by_type.values(), key=lambda b: ALERT_RANK[b["max_alert"]])
            highest_level = country_highest["max_alert"]
            severity = ALERT_SEVERITY[highest_level]
            country_name = dominant["country"] or iso3
            label = EVENT_TYPE_LABELS[dominant_type]
            count = dominant["count"]
            title = (
                f"{count} {label} event(s) in {country_name} "
                f"(alert: {highest_level})"
            )
            parts = []
            for et, stats in sorted(by_type.items()):
                parts.append(
                    f"{EVENT_TYPE_LABELS[et]}:{stats['count']} ({stats['max_alert']})"
                )
            description = "; ".join(parts)

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
        "Done inserted=%s updated=%s skipped_geo=%s",
        inserted,
        updated,
        skipped_geo,
    )
    trigger_signal_notifications()
    logger.info("ingest_gdacs completed successfully")


def main() -> None:
    configure_logging()
    try:
        ingest()
    except Exception:
        logger.exception("ingest_gdacs failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
