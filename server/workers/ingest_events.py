"""
Ingest GDELT news events into market_signals (Layer 2).

API: https://api.gdeltproject.org/api/v2/doc/doc
  ?query={query}&mode=ArtList&maxrecords=50&format=json&timespan=7d

Falls back to source='gdelt_seed' if the API is unreachable or returns nothing.
"""

from __future__ import annotations

import logging
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any, Optional
from urllib.parse import urlparse

import requests

from config import LOGS_DIR
from country_aliases import NAME_TO_ISO
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications
from signal_common import iso_from_country_label

SOURCE = "gdelt"
SEED_SOURCE = "gdelt_seed"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
REQUEST_TIMEOUT_SEC = 60
QUERY_DELAY_SEC = 5.0
MAXRECORDS = 25
RATE_LIMIT_BACKOFF_SEC = 30

# (query, signal_type, direction, affected_dimensions)
# trajectory omitted — not in BASE_DIMENSION_KEYS for projection adjustments.
GDELT_QUERIES: list[tuple[str, str, str, list[str]]] = [
    (
        '"trade tariff" OR "import duty" OR "tariff increase"',
        "tariff_risk",
        "negative",
        ["taxEnvironment", "competitorSaturation"],
    ),
    (
        '"economic sanctions" OR "trade embargo" OR "sanctions imposed"',
        "sanctions",
        "negative",
        ["regulatoryEase", "marketSizeAndGrowth"],
    ),
    (
        '"trade agreement" OR "free trade" OR "trade deal signed"',
        "trade_agreement",
        "positive",
        ["marketSizeAndGrowth", "competitorSaturation"],
    ),
    (
        '"new regulation" OR "regulatory reform" OR "business regulation"',
        "regulatory_change",
        "neutral",
        ["regulatoryEase"],
    ),
    (
        '"political crisis" OR "coup" OR "civil unrest" OR "political instability"',
        "political_instability",
        "negative",
        ["regulatoryEase"],
    ),
    (
        '"currency devaluation" OR "currency crisis"',
        "currency_crisis",
        "negative",
        ["taxEnvironment", "marketSizeAndGrowth"],
    ),
    (
        '"natural disaster" OR "hurricane" OR "earthquake" OR "flooding"',
        "natural_disaster",
        "negative",
        ["infrastructure", "marketSizeAndGrowth"],
    ),
    (
        '"economic reform" OR "investment incentive" OR "tax incentive"',
        "economic_policy",
        "positive",
        ["marketSizeAndGrowth"],
    ),
]

TLD_TO_ISO: dict[str, str] = {
    "mx": "MEX",
    "de": "DEU",
    "fr": "FRA",
    "uk": "GBR",
    "jp": "JPN",
    "cn": "CHN",
    "br": "BRA",
    "in": "IND",
    "kr": "KOR",
    "au": "AUS",
    "ca": "CAN",
    "it": "ITA",
    "es": "ESP",
    "nl": "NLD",
    "pl": "POL",
    "ru": "RUS",
    "za": "ZAF",
    "tr": "TUR",
    "ar": "ARG",
    "cl": "CHL",
    "co": "COL",
    "sg": "SGP",
    "vn": "VNM",
    "id": "IDN",
    "th": "THA",
    "ng": "NGA",
    "eg": "EGY",
    "sa": "SAU",
    "ae": "ARE",
    "il": "ISR",
    "ua": "UKR",
}

EU_TOP5 = ["DEU", "FRA", "ITA", "ESP", "NLD"]
BRICS = ["BRA", "RUS", "IND", "CHN", "ZAF"]

ABBREV_PATTERNS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"\b(?:u\.?s\.?a\.?|united states(?: of america)?)\b", re.I), ["USA"]),
    (re.compile(r"\b(?:u\.?k\.?|united kingdom|britain)\b", re.I), ["GBR"]),
    (re.compile(r"\b(?:european union|eurozone|\beu\b)\b", re.I), EU_TOP5),
    (re.compile(r"\bbrics\b", re.I), BRICS),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_events.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_events")


def _country_name_patterns() -> list[tuple[re.Pattern[str], str]]:
    patterns: list[tuple[re.Pattern[str], str]] = []
    short_ok = {"iran", "iraq", "oman", "peru", "cuba", "chad", "fiji", "togo", "mali", "laos"}
    for name, iso in sorted(NAME_TO_ISO.items(), key=lambda kv: len(kv[0]), reverse=True):
        if len(name) < 4 and name not in short_ok:
            continue
        patterns.append((re.compile(rf"\b{re.escape(name)}\b", re.I), iso))
    return patterns


_COUNTRY_NAME_PATTERNS = _country_name_patterns()


def extract_iso_codes(text: str) -> list[str]:
    found: set[str] = set()
    for pattern, isos in ABBREV_PATTERNS:
        if pattern.search(text):
            found.update(isos)
    for pattern, iso in _COUNTRY_NAME_PATTERNS:
        if pattern.search(text):
            found.add(iso)
    return sorted(found)


def iso_from_url(url: str | None) -> Optional[str]:
    if not url:
        return None
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return None
    parts = host.lower().split(".")
    if len(parts) < 2:
        return None
    tld = parts[-1]
    if tld == "uk" and len(parts) >= 2 and parts[-2] == "co":
        return "GBR"
    return TLD_TO_ISO.get(tld)


def fetch_gdelt(query: str) -> list[dict[str, Any]]:
    """Fetch ArtList JSON; on HTTP 429 wait and retry once."""
    params = {
        "query": query,
        "mode": "ArtList",
        "maxrecords": MAXRECORDS,
        "format": "json",
        "timespan": "7d",
    }
    headers = {"User-Agent": "GEXIS-MVP/0.1 (data-engine)"}

    for attempt in range(2):
        response = requests.get(
            GDELT_URL,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT_SEC,
        )
        if response.status_code == 429:
            if attempt == 0:
                logger.warning(
                    "GDELT 429 for query %r — backing off %ss then retrying once",
                    query,
                    RATE_LIMIT_BACKOFF_SEC,
                )
                time.sleep(RATE_LIMIT_BACKOFF_SEC)
                continue
            logger.warning("GDELT still 429 after retry for query %r — skipping", query)
            return []
        response.raise_for_status()
        text = (response.text or "").strip()
        if not text:
            return []
        try:
            payload = response.json()
        except ValueError:
            logger.warning(
                "GDELT non-JSON response for query %r (len=%s)", query, len(text)
            )
            return []
        articles = payload.get("articles") if isinstance(payload, dict) else None
        if not isinstance(articles, list):
            return []
        return [a for a in articles if isinstance(a, dict)]
    return []


def title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    source: str,
    signal_type: str,
    title: str,
    description: Optional[str],
    severity: int,
    direction: str,
    affected_dimensions: list[str],
    event_url: Optional[str],
    expires_at: datetime,
) -> str:
    prefix = title[:100]
    cursor.execute(
        """
        SELECT id, title FROM market_signals
        WHERE source = %s
          AND geography_id = %s
          AND signal_type = %s
          AND lower(left(title, 100)) = lower(%s)
        LIMIT 1
        """,
        (source, geography_id, signal_type, prefix),
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """
            UPDATE market_signals
            SET severity = %s,
                direction = %s,
                affected_dimensions = %s,
                description = %s,
                event_url = %s,
                expires_at = %s,
                resolved = false,
                fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                severity,
                direction,
                affected_dimensions,
                description,
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
            source,
            signal_type,
            title,
            description,
            severity,
            direction,
            affected_dimensions,
            event_url,
            expires_at,
        ),
    )
    return "insert"


def seed_gdelt_signals(cursor, iso_map: dict[str, str]) -> int:
    """
    Realistic 2026-relevant news seeds when GDELT is unavailable.

    Marked source='gdelt_seed'.
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)
    seeds = [
        {
            "isos": ["USA", "CHN"],
            "signal_type": "tariff_risk",
            "title": "US and China trade tariff tensions escalate in 2026 negotiations",
            "description": "Seed: renewed tariff threats affecting bilateral goods trade.",
            "direction": "negative",
            "dims": ["taxEnvironment", "competitorSaturation"],
        },
        {
            "isos": ["USA", "MEX"],
            "signal_type": "tariff_risk",
            "title": "US reviews import duties on Mexican automotive and steel shipments",
            "description": "Seed: USMCA-related tariff risk for North American supply chains.",
            "direction": "negative",
            "dims": ["taxEnvironment", "competitorSaturation"],
        },
        {
            "isos": ["CHN", "NLD"],
            "signal_type": "sanctions",
            "title": "Western allies discuss economic sanctions and chip export controls on China",
            "description": "Seed: semiconductor-related sanctions risk.",
            "direction": "negative",
            "dims": ["regulatoryEase", "marketSizeAndGrowth"],
        },
        {
            "isos": ["GBR", "IND"],
            "signal_type": "trade_agreement",
            "title": "UK and India advance free trade agreement talks toward 2026 signing",
            "description": "Seed: positive trade-agreement momentum.",
            "direction": "positive",
            "dims": ["marketSizeAndGrowth", "competitorSaturation"],
        },
        {
            "isos": ["DEU", "FRA"],
            "signal_type": "regulatory_change",
            "title": "EU advances new business regulation and compliance requirements for exporters",
            "description": "Seed: regulatory reform affecting EU market entry.",
            "direction": "neutral",
            "dims": ["regulatoryEase"],
        },
        {
            "isos": ["BRA"],
            "signal_type": "political_instability",
            "title": "Political crisis in Brazil raises market uncertainty over fiscal reforms",
            "description": "Seed: political instability signal for LatAm entry planning.",
            "direction": "negative",
            "dims": ["regulatoryEase"],
        },
        {
            "isos": ["TUR", "ARG"],
            "signal_type": "currency_crisis",
            "title": "Currency devaluation pressures intensify in emerging markets",
            "description": "Seed: FX crisis risk for high-inflation economies.",
            "direction": "negative",
            "dims": ["taxEnvironment", "marketSizeAndGrowth"],
        },
        {
            "isos": ["USA", "JPN"],
            "signal_type": "natural_disaster",
            "title": "Pacific earthquake and flooding disrupt regional infrastructure corridors",
            "description": "Seed: natural disaster impact on logistics and infrastructure.",
            "direction": "negative",
            "dims": ["infrastructure", "marketSizeAndGrowth"],
        },
        {
            "isos": ["VNM", "IDN"],
            "signal_type": "economic_policy",
            "title": "Southeast Asian governments expand investment incentives and tax incentives",
            "description": "Seed: positive economic reform / incentive packages.",
            "direction": "positive",
            "dims": ["marketSizeAndGrowth"],
        },
        {
            "isos": ["SAU", "ARE"],
            "signal_type": "economic_policy",
            "title": "Gulf states announce economic reform packages to attract foreign investment",
            "description": "Seed: investment-incentive policy signal.",
            "direction": "positive",
            "dims": ["marketSizeAndGrowth"],
        },
    ]

    written = 0
    for seed in seeds:
        for iso in seed["isos"]:
            if iso not in iso_map:
                continue
            upsert_signal(
                cursor,
                geography_id=iso_map[iso],
                source=SEED_SOURCE,
                signal_type=seed["signal_type"],
                title=seed["title"][:200],
                description=seed["description"][:500],
                severity=3,
                direction=seed["direction"],
                affected_dimensions=seed["dims"],
                event_url=None,
                expires_at=expires,
            )
            written += 1
    return written


def ingest() -> None:
    articles_seen = 0
    groups_written = 0
    inserts = 0
    updates = 0
    api_failures = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        # Dedup groups: (signal_type, iso, title_key) -> best article
        groups: dict[tuple[str, str, str], dict[str, Any]] = {}

        for idx, (query, signal_type, direction, dims) in enumerate(GDELT_QUERIES):
            if idx > 0:
                time.sleep(QUERY_DELAY_SEC)
            try:
                articles = fetch_gdelt(query)
                logger.info("GDELT query %r -> %s articles", signal_type, len(articles))
            except Exception:
                api_failures += 1
                logger.exception("GDELT query failed for %s", signal_type)
                continue

            for article in articles:
                articles_seen += 1
                title = (article.get("title") or "").strip()
                if not title:
                    continue
                url = article.get("url")
                # Prefer API sourcecountry, then title extraction, then URL TLD.
                isos: list[str] = []
                src_country = article.get("sourcecountry")
                if isinstance(src_country, str) and src_country.strip():
                    mapped = iso_from_country_label(src_country)
                    if mapped:
                        isos = [mapped]
                if not isos:
                    isos = extract_iso_codes(title)
                if not isos:
                    tld_iso = iso_from_url(url if isinstance(url, str) else None)
                    if tld_iso:
                        isos = [tld_iso]
                if not isos:
                    continue

                description = article.get("seendate") or article.get("domain") or None
                if isinstance(description, str) and len(description) > 500:
                    description = description[:497] + "..."

                for iso in isos:
                    if iso not in iso_map:
                        continue
                    # Fuzzy group key: first 80 chars normalized
                    title_key = re.sub(r"\s+", " ", title.lower())[:80]
                    # Merge with existing similar titles for same type+iso
                    merged_key = None
                    for existing_key in list(groups.keys()):
                        est, eiso, etitle = existing_key
                        if est == signal_type and eiso == iso:
                            if title_similarity(etitle, title_key) >= 0.72:
                                merged_key = existing_key
                                break
                    key = merged_key or (signal_type, iso, title_key)
                    prev = groups.get(key)
                    candidate = {
                        "geography_id": iso_map[iso],
                        "signal_type": signal_type,
                        "direction": direction,
                        "dims": dims,
                        "title": title[:200],
                        "description": description,
                        "event_url": url if isinstance(url, str) else None,
                        "seendate": article.get("seendate") or "",
                    }
                    if prev is None or (candidate["seendate"] > prev.get("seendate", "")):
                        # If merging under existing key, replace; else new
                        if merged_key and merged_key != key:
                            groups.pop(merged_key, None)
                        groups[key] = candidate

        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        for item in groups.values():
            groups_written += 1
            action = upsert_signal(
                cursor,
                geography_id=item["geography_id"],
                source=SOURCE,
                signal_type=item["signal_type"],
                title=item["title"],
                description=item["description"],
                severity=3,
                direction=item["direction"],
                affected_dimensions=item["dims"],
                event_url=item["event_url"],
                expires_at=expires_at,
            )
            if action == "insert":
                inserts += 1
            else:
                updates += 1

        if inserts + updates == 0:
            logger.warning(
                "No GDELT signals written (api_failures=%s articles_seen=%s). "
                "Loading gdelt_seed rows. GDELT Doc API may be rate-limited, "
                "returning empty ArtList payloads, or blocked from this environment.",
                api_failures,
                articles_seen,
            )
            seeded = seed_gdelt_signals(cursor, iso_map)
            inserts += seeded
            logger.info("Seeded %s gdelt_seed signal rows", seeded)

    logger.info(
        "Done articles_seen=%s groups=%s inserted=%s updated=%s api_failures=%s",
        articles_seen,
        groups_written,
        inserts,
        updates,
        api_failures,
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
        logger.info("ingest_events completed successfully")
    except Exception:
        logger.exception("ingest_events failed")
        sys.exit(1)
