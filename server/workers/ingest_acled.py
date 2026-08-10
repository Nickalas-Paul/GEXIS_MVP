"""
Ingest ACLED conflict / protest events into market_signals (Layer 2).

Auth: OAuth password grant → Bearer token
API:  https://acleddata.com/api/acled/read

Aggregates events by country + mapped signal_type over a 30-day window.
Credentials: ACLED_EMAIL / ACLED_PASSWORD in repo-root .env.
"""

from __future__ import annotations

import logging
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from country_aliases import NAME_TO_ISO
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications
from signal_common import iso_from_country_label

SOURCE = "acled"
OAUTH_URL = "https://acleddata.com/oauth/token"
ACLED_READ_URL = "https://acleddata.com/api/acled/read"
REQUEST_TIMEOUT_SEC = 120
PAGE_LIMIT = 5000
MAX_PAGES = 3
MIN_EVENTS = 3
EVENT_URL = "https://acleddata.com/data-export-tool/"
WINDOW_DAYS = 30
EXPIRE_DAYS = 14

# (disorder_type lower, event_type lower) → (signal_type, direction, label, dims)
EVENT_MAP: dict[tuple[str, str], tuple[str, str, str, list[str]]] = {
    ("demonstrations", "protests"): (
        "political_instability",
        "negative",
        "protest",
        ["regulatoryEase", "marketSizeAndGrowth"],
    ),
    ("demonstrations", "riots"): (
        "labor_unrest",
        "negative",
        "riot",
        ["talentDensity", "competitorSaturation"],
    ),
    ("political violence", "battles"): (
        "political_instability",
        "negative",
        "armed conflict",
        ["regulatoryEase", "marketSizeAndGrowth"],
    ),
    ("political violence", "violence against civilians"): (
        "political_instability",
        "negative",
        "violence against civilians",
        ["regulatoryEase", "marketSizeAndGrowth"],
    ),
    ("political violence", "explosions/remote violence"): (
        "political_instability",
        "negative",
        "explosion/remote violence",
        ["regulatoryEase", "marketSizeAndGrowth"],
    ),
}

# Strategic developments: any event_type under this disorder
STRATEGIC_KEY = "strategic developments"
STRATEGIC_META = (
    "regulatory_change",
    "neutral",
    "strategic development",
    ["regulatoryEase"],
)


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_acled.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_acled")


def get_acled_token(email: str, password: str) -> str:
    response = requests.post(
        OAUTH_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "username": email,
            "password": password,
            "grant_type": "password",
            "client_id": "acled",
            "scope": "authenticated",
        },
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"ACLED OAuth response missing access_token: {payload}")
    return str(token)


def map_event(
    disorder_type: str, event_type: str
) -> Optional[tuple[str, str, str, list[str]]]:
    d = (disorder_type or "").strip().lower()
    e = (event_type or "").strip().lower()
    if d == STRATEGIC_KEY:
        return STRATEGIC_META
    return EVENT_MAP.get((d, e))


def severity_from_counts(events: int, fatalities: int) -> int:
    if fatalities > 100 or events > 50:
        return 5
    if fatalities > 50 or events > 25:
        return 4
    if fatalities > 10 or events > 10:
        return 3
    if fatalities > 0 or events > 5:
        return 2
    return 1


def resolve_iso3(country: str | None, iso_field: Any) -> Optional[str]:
    """Prefer country name → ISO3; fall back to numeric iso via aliases if needed."""
    if country:
        mapped = iso_from_country_label(country)
        if mapped:
            return mapped
        key = country.strip().lower()
        if key in NAME_TO_ISO:
            return NAME_TO_ISO[key]
    # Numeric ISO (ACLED) is not our ISO3 — skip unless name worked
    return None


def fetch_events(token: str, start: date, end: date) -> list[dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "GEXIS-MVP/0.1 (data-engine)",
    }
    fields = (
        "event_id_cnty|event_date|event_type|sub_event_type|country|iso|"
        "fatalities|disorder_type|notes|source"
    )
    all_rows: list[dict[str, Any]] = []

    for page in range(1, MAX_PAGES + 1):
        params = {
            "_format": "json",
            "event_date": f"{start.isoformat()}|{end.isoformat()}",
            "event_date_where": "BETWEEN",
            "fields": fields,
            "limit": PAGE_LIMIT,
            "page": page,
        }
        response = requests.get(
            ACLED_READ_URL,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT_SEC,
        )
        if response.status_code in (401, 403):
            logger.error(
                "ACLED data request returned %s — token rejected or account lacks "
                "API access group (Open myACLED accounts often OAuth-succeed but "
                "still get Access denied until Research/Partner/Enterprise API "
                "access is granted). Body: %s",
                response.status_code,
                (response.text or "")[:400],
            )
            raise PermissionError(f"ACLED {response.status_code}")
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("data") if isinstance(payload, dict) else None
        if rows is None and isinstance(payload, list):
            rows = payload
        if not isinstance(rows, list):
            logger.warning(
                "Unexpected ACLED payload keys=%s",
                list(payload.keys()) if isinstance(payload, dict) else type(payload),
            )
            break
        batch = [r for r in rows if isinstance(r, dict)]
        all_rows.extend(batch)
        logger.info("ACLED page %s -> %s events (total=%s)", page, len(batch), len(all_rows))
        if len(batch) < PAGE_LIMIT:
            break

    return all_rows


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    signal_type: str,
    title: str,
    description: Optional[str],
    severity: int,
    direction: str,
    affected_dimensions: list[str],
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
                severity,
                direction,
                affected_dimensions,
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
            severity,
            direction,
            affected_dimensions,
            EVENT_URL,
            expires_at,
        ),
    )
    return "insert"


def ingest() -> None:
    email = (os.getenv("ACLED_EMAIL") or "").strip()
    password = os.getenv("ACLED_PASSWORD") or ""
    if not email or not password:
        logger.error(
            "ACLED_EMAIL / ACLED_PASSWORD not set in environment (.env). Aborting."
        )
        sys.exit(1)

    try:
        token = get_acled_token(email, password)
        logger.info("ACLED OAuth token obtained")
    except Exception:
        logger.exception(
            "ACLED OAuth token request failed (check credentials / account status)"
        )
        sys.exit(1)

    today = date.today()
    start = today - timedelta(days=WINDOW_DAYS)

    try:
        events = fetch_events(token, start, today)
    except PermissionError:
        sys.exit(1)
    except Exception:
        logger.exception("ACLED data fetch failed")
        sys.exit(1)

    if not events:
        logger.info("No ACLED events in window %s to %s — exiting cleanly", start, today)
        return

    logger.info("Fetched %s ACLED events for %s .. %s", len(events), start, today)

    # Aggregate: (iso3, signal_type) -> stats
    # value: events, fatalities, label, direction, dims, latest_notes, latest_date
    buckets: dict[tuple[str, str], dict[str, Any]] = {}
    countries_seen: set[str] = set()
    skipped_unmap = 0
    skipped_nomap = 0

    for row in events:
        meta = map_event(str(row.get("disorder_type") or ""), str(row.get("event_type") or ""))
        if meta is None:
            skipped_unmap += 1
            continue

        signal_type, direction, label, dims = meta
        iso3 = resolve_iso3(
            str(row.get("country") or "") if row.get("country") else None,
            row.get("iso"),
        )
        if not iso3:
            skipped_nomap += 1
            continue

        countries_seen.add(iso3)
        key = (iso3, signal_type)
        bucket = buckets.get(key)
        fatalities = 0
        try:
            fatalities = int(float(row.get("fatalities") or 0))
        except (TypeError, ValueError):
            fatalities = 0

        event_date = str(row.get("event_date") or "")
        notes = row.get("notes")
        notes_s = notes.strip() if isinstance(notes, str) else None

        if bucket is None:
            buckets[key] = {
                "events": 1,
                "fatalities": max(0, fatalities),
                "label": label,
                "direction": direction,
                "dims": dims,
                "country": str(row.get("country") or iso3),
                "latest_notes": notes_s,
                "latest_date": event_date,
            }
        else:
            bucket["events"] += 1
            bucket["fatalities"] += max(0, fatalities)
            # Prefer the same label if already set; keep most recent notes
            if event_date >= (bucket.get("latest_date") or ""):
                bucket["latest_date"] = event_date
                if notes_s:
                    bucket["latest_notes"] = notes_s
            # If multiple event types collapse into same signal_type, keep a
            # generic label when they differ.
            if bucket["label"] != label and signal_type == "political_instability":
                bucket["label"] = "political violence / protest"

    logger.info(
        "Countries with mapped events=%s aggregate_buckets=%s "
        "skipped_unmapped_type=%s skipped_no_iso=%s",
        len(countries_seen),
        len(buckets),
        skipped_unmap,
        skipped_nomap,
    )

    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    inserted = 0
    updated = 0
    skipped_low = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        for (iso3, signal_type), bucket in buckets.items():
            count = int(bucket["events"])
            if count < MIN_EVENTS:
                skipped_low += 1
                continue
            if iso3 not in iso_map:
                continue

            fatalities = int(bucket["fatalities"])
            severity = severity_from_counts(count, fatalities)
            country_name = bucket["country"]
            label = bucket["label"]
            # Pluralize simply
            unit = f"{label} events" if not label.endswith("s") else f"{label} events"
            title = (
                f"{count} {unit} reported in {country_name} in the last {WINDOW_DAYS} days "
                f"({fatalities} fatalities)"
            )
            description = bucket.get("latest_notes")
            if isinstance(description, str) and len(description) > 500:
                description = description[:497] + "..."

            action = upsert_signal(
                cursor,
                geography_id=iso_map[iso3],
                signal_type=signal_type,
                title=title[:500],
                description=description,
                severity=severity,
                direction=bucket["direction"],
                affected_dimensions=bucket["dims"],
                expires_at=expires_at,
            )
            if action == "insert":
                inserted += 1
            else:
                updated += 1

    logger.info(
        "Done inserted=%s updated=%s skipped_below_threshold=%s",
        inserted,
        updated,
        skipped_low,
    )


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        try:
            trigger_signal_notifications()
        except Exception:
            logger.exception(
                "Signal notification hook failed (ingestion already succeeded)"
            )
        logger.info("ingest_acled completed successfully")
    except SystemExit:
        raise
    except Exception:
        logger.exception("ingest_acled failed")
        sys.exit(1)
