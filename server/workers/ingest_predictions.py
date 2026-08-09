"""
Ingest prediction-market signals into market_signals (Layer 2).

Primary source: Polymarket Gamma public-search API
  GET https://gamma-api.polymarket.com/public-search?q={keyword}

Falls back to realistic seed rows (source='seed') if the API is unreachable
or returns no relevant markets after keyword filtering.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from country_aliases import NAME_TO_ISO, resolve_iso_from_name
from db import get_cursor, load_geography_iso_map, normalize_country_name

SOURCE = "polymarket"
SEED_SOURCE = "seed"
GAMMA_SEARCH_URL = "https://gamma-api.polymarket.com/public-search"
REQUEST_TIMEOUT_SEC = 60
MAX_RETRIES = 3
MIN_VOLUME = 10_000.0  # filter out very low-liquidity markets
SEARCH_KEYWORDS = [
    "tariff",
    "trade",
    "sanctions",
    "regulation",
    "tax",
    "GDP",
    "recession",
    "election",
    "currency",
    "imports",
    "exports",
    "embargo",
]

# Extra demonyms / abbreviations not covered as full country names.
EXTRA_ALIASES: dict[str, str] = {
    "us": "USA",
    "u.s.": "USA",
    "u.s": "USA",
    "american": "USA",
    "americans": "USA",
    "chinese": "CHN",
    "mexican": "MEX",
    "mexicans": "MEX",
    "canadian": "CAN",
    "british": "GBR",
    "uk": "GBR",
    "german": "DEU",
    "french": "FRA",
    "japanese": "JPN",
    "indian": "IND",
    "brazilian": "BRA",
    "russian": "RUS",
    "ukrainian": "UKR",
    "iranian": "IRN",
    "israeli": "ISR",
    "saudi": "SAU",
    "korean": "KOR",
    "south korean": "KOR",
    "north korean": "PRK",
    "taiwanese": "TWN",
    "australian": "AUS",
    "vietnamese": "VNM",
    "turkish": "TUR",
}

EU_ISO3 = ["DEU", "FRA", "ITA", "ESP", "NLD", "BEL", "POL", "SWE"]

# (keywords, signal_type, affected_dimensions, direction)
SIGNAL_RULES: list[tuple[tuple[str, ...], str, list[str], str]] = [
    (
        ("tariff", "duty", "import tax", "duties"),
        "tariff_risk",
        ["taxEnvironment", "competitorSaturation"],
        "negative",
    ),
    (
        ("sanction", "embargo", "ban"),
        "sanctions",
        ["regulatoryEase", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        ("trade deal", "trade agreement", "fta", "free trade"),
        "trade_agreement",
        ["marketSizeAndGrowth", "competitorSaturation"],
        "positive",
    ),
    (
        ("regulation", "regulatory", "compliance", "law"),
        "regulatory_change",
        ["regulatoryEase"],
        "neutral",
    ),
    (
        ("election", "coup", "political", "government", "prime minister", "president"),
        "political_instability",
        ["regulatoryEase", "trajectory"],
        "negative",
    ),
    (
        ("currency", "devaluation", "exchange rate", "forex"),
        "currency_crisis",
        ["taxEnvironment", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        ("recession", "gdp", "economic downturn", "rate cut", "fed "),
        "economic_policy",
        ["marketSizeAndGrowth", "trajectory"],
        "neutral",
    ),
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_predictions.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_predictions")


def severity_from_probability(probability: float) -> int:
    if probability >= 0.75:
        return 5
    if probability >= 0.60:
        return 4
    if probability >= 0.45:
        return 3
    if probability >= 0.30:
        return 2
    return 1


def parse_outcome_prices(raw: Any) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    out: list[float] = []
    for item in raw:
        try:
            out.append(float(item))
        except (TypeError, ValueError):
            continue
    return out


def yes_probability(market: dict[str, Any]) -> Optional[float]:
    prices = parse_outcome_prices(market.get("outcomePrices"))
    if not prices:
        return None
    # Convention: first outcome is YES / affirmative.
    p = prices[0]
    if p < 0 or p > 1:
        return None
    return p


def market_volume(market: dict[str, Any]) -> float:
    for key in ("volumeNum", "volume", "volumeClob"):
        val = market.get(key)
        if val is None:
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return 0.0


def classify_signal(text: str) -> Optional[tuple[str, list[str], str]]:
    lower = text.lower()
    for keywords, signal_type, dims, direction in SIGNAL_RULES:
        if any(k in lower for k in keywords):
            return signal_type, dims, direction
    return None


def extract_iso_codes(text: str) -> list[str]:
    """Map country names / demonyms in text to ISO3 codes."""
    lower = " " + normalize_country_name(text) + " "
    found: set[str] = set()

    # Prefer longer alias keys first to avoid partial collisions.
    aliases = {**NAME_TO_ISO, **EXTRA_ALIASES}
    for alias, iso in sorted(aliases.items(), key=lambda kv: len(kv[0]), reverse=True):
        token = f" {alias} "
        if token in lower:
            found.add(iso)

    # EU / European Union → major economies (multi-row expansion)
    if " european union " in lower or " eu " in lower or " eurozone " in lower:
        found.update(EU_ISO3)

    # Direct resolve for whole-title matches via resolve helper
    for chunk in text.replace("/", " ").replace("-", " ").split(","):
        iso = resolve_iso_from_name(chunk.strip(), normalize_country_name)
        if iso:
            found.add(iso)

    return sorted(found)


def fetch_search(keyword: str) -> list[dict[str, Any]]:
    """Return market dicts from Polymarket public-search for one keyword."""
    last_error: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(
                GAMMA_SEARCH_URL,
                params={"q": keyword},
                headers={"User-Agent": "GEXIS-MVP/0.1 (data-engine)"},
                timeout=REQUEST_TIMEOUT_SEC,
            )
            response.raise_for_status()
            payload = response.json()
            events = payload.get("events") if isinstance(payload, dict) else None
            if not isinstance(events, list):
                return []
            markets: list[dict[str, Any]] = []
            for event in events:
                if not isinstance(event, dict):
                    continue
                event_slug = event.get("slug") or ""
                event_title = event.get("title") or ""
                for market in event.get("markets") or []:
                    if not isinstance(market, dict):
                        continue
                    enriched = dict(market)
                    enriched["_event_slug"] = event_slug
                    enriched["_event_title"] = event_title
                    markets.append(enriched)
            return markets
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Polymarket search attempt %s/%s failed for q=%s: %s",
                attempt,
                MAX_RETRIES,
                keyword,
                exc,
            )
    if last_error is not None:
        raise last_error
    return []


def market_event_url(market: dict[str, Any]) -> str:
    slug = market.get("slug") or market.get("_event_slug") or ""
    if slug:
        return f"https://polymarket.com/event/{slug}"
    return "https://polymarket.com"


def parse_expires_at(market: dict[str, Any]) -> datetime:
    for key in ("endDate", "endDateIso", "end_date_iso"):
        raw = market.get(key)
        if not raw:
            continue
        try:
            text = str(raw).replace("Z", "+00:00")
            return datetime.fromisoformat(text).astimezone(timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc) + timedelta(days=90)


def upsert_signal(
    cursor,
    *,
    geography_id: Optional[str],
    source: str,
    signal_type: str,
    title: str,
    description: Optional[str],
    probability: float,
    severity: int,
    direction: str,
    affected_dimensions: list[str],
    event_url: Optional[str],
    expires_at: datetime,
) -> str:
    """Insert or update by (source, title, geography_id). Returns 'insert'|'update'."""
    cursor.execute(
        """
        SELECT id FROM market_signals
        WHERE source = %s
          AND title = %s
          AND geography_id IS NOT DISTINCT FROM %s
        LIMIT 1
        """,
        (source, title, geography_id),
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """
            UPDATE market_signals
            SET probability = %s,
                severity = %s,
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
                probability,
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
            %s, %s, %s, %s,
            %s, false, %s, NOW(), NOW(), NOW()
        )
        """,
        (
            geography_id,
            source,
            signal_type,
            title,
            description,
            probability,
            severity,
            direction,
            affected_dimensions,
            event_url,
            expires_at,
        ),
    )
    return "insert"


def seed_signals(cursor, iso_map: dict[str, str]) -> int:
    """
    Realistic 2026-relevant seed signals when Polymarket yields nothing usable.

    Marked source='seed' so they are distinguishable from live API rows.
    """
    now = datetime.now(timezone.utc)
    seeds = [
        {
            "isos": ["USA", "MEX"],
            "signal_type": "tariff_risk",
            "title": "Will the US impose new tariffs on Mexican auto imports by Q1 2027?",
            "description": "Seed signal for USMCA auto-sector tariff risk monitoring.",
            "probability": 0.72,
            "direction": "negative",
            "affected_dimensions": ["taxEnvironment", "competitorSaturation"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=180),
        },
        {
            "isos": ["USA", "CHN"],
            "signal_type": "tariff_risk",
            "title": "Will US average tariffs on Chinese goods exceed 40% by end of 2026?",
            "description": "Seed signal tracking escalation of US–China tariff rates.",
            "probability": 0.58,
            "direction": "negative",
            "affected_dimensions": ["taxEnvironment", "competitorSaturation"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=150),
        },
        {
            "isos": ["CHN", "TWN"],
            "signal_type": "sanctions",
            "title": "Will new semiconductor export controls targeting China take effect in 2026?",
            "description": "Seed signal for tech-export sanctions affecting Asia supply chains.",
            "probability": 0.64,
            "direction": "negative",
            "affected_dimensions": ["regulatoryEase", "marketSizeAndGrowth"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=120),
        },
        {
            "isos": ["GBR", "USA"],
            "signal_type": "trade_agreement",
            "title": "Will a US–UK free trade agreement be signed before 2027?",
            "description": "Seed opportunity signal for bilateral trade liberalization.",
            "probability": 0.31,
            "direction": "positive",
            "affected_dimensions": ["marketSizeAndGrowth", "competitorSaturation"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=200),
        },
        {
            "isos": ["DEU", "FRA"],
            "signal_type": "regulatory_change",
            "title": "Will the EU enact a new AI compliance package affecting exporters in 2026?",
            "description": "Seed regulatory signal for EU digital compliance burden.",
            "probability": 0.55,
            "direction": "neutral",
            "affected_dimensions": ["regulatoryEase"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=160),
        },
        {
            "isos": ["BRA"],
            "signal_type": "political_instability",
            "title": "Will Brazil face a major fiscal-policy reversal before mid-2027?",
            "description": "Seed political/policy risk signal for Latin America market entry.",
            "probability": 0.41,
            "direction": "negative",
            "affected_dimensions": ["regulatoryEase", "trajectory"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=210),
        },
        {
            "isos": ["TUR"],
            "signal_type": "currency_crisis",
            "title": "Will the Turkish lira lose more than 25% vs USD in 2026?",
            "description": "Seed currency-crisis signal for FX-sensitive market planning.",
            "probability": 0.48,
            "direction": "negative",
            "affected_dimensions": ["taxEnvironment", "marketSizeAndGrowth"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=140),
        },
        {
            "isos": ["USA"],
            "signal_type": "economic_policy",
            "title": "Will the US enter a recession by end of 2026?",
            "description": "Seed macro signal affecting market-size and trajectory projections.",
            "probability": 0.36,
            "direction": "neutral",
            "affected_dimensions": ["marketSizeAndGrowth", "trajectory"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=170),
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
                title=seed["title"],
                description=seed["description"],
                probability=float(seed["probability"]),
                severity=severity_from_probability(float(seed["probability"])),
                direction=seed["direction"],
                affected_dimensions=seed["affected_dimensions"],
                event_url=seed["event_url"],
                expires_at=seed["expires_at"],
            )
            written += 1
    return written


def ingest() -> None:
    fetched_markets = 0
    relevant = 0
    written = 0
    updated = 0
    skipped_no_country = 0
    api_failed = False
    seen_keys: set[tuple[str, str]] = set()  # (title, iso) de-dupe across searches

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        all_markets: list[dict[str, Any]] = []
        for keyword in SEARCH_KEYWORDS:
            try:
                batch = fetch_search(keyword)
                logger.info("Keyword %r returned %s markets", keyword, len(batch))
                all_markets.extend(batch)
            except Exception:
                api_failed = True
                logger.exception("Polymarket API failed for keyword %r", keyword)

        # De-dupe by market id/slug within this run
        unique_markets: dict[str, dict[str, Any]] = {}
        for market in all_markets:
            key = str(market.get("id") or market.get("slug") or market.get("question"))
            if key and key not in unique_markets:
                unique_markets[key] = market
        fetched_markets = len(unique_markets)

        for market in unique_markets.values():
            if market.get("closed") is True or market.get("active") is False:
                continue
            volume = market_volume(market)
            if volume < MIN_VOLUME:
                continue

            title = (market.get("question") or market.get("_event_title") or "").strip()
            if not title:
                continue
            blob = f"{title} {market.get('description') or ''} {market.get('_event_title') or ''}"
            classified = classify_signal(blob)
            if classified is None:
                continue

            signal_type, affected_dimensions, direction = classified
            probability = yes_probability(market)
            if probability is None:
                continue

            isos = extract_iso_codes(blob)
            if not isos:
                skipped_no_country += 1
                continue

            relevant += 1
            description = market.get("description")
            if isinstance(description, str) and len(description) > 500:
                description = description[:497] + "..."
            elif not isinstance(description, str):
                description = None

            expires_at = parse_expires_at(market)
            event_url = market_event_url(market)
            severity = severity_from_probability(probability)

            for iso in isos:
                if iso not in iso_map:
                    continue
                dedupe_key = (title, iso)
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                action = upsert_signal(
                    cursor,
                    geography_id=iso_map[iso],
                    source=SOURCE,
                    signal_type=signal_type,
                    title=title,
                    description=description,
                    probability=probability,
                    severity=severity,
                    direction=direction,
                    affected_dimensions=affected_dimensions,
                    event_url=event_url,
                    expires_at=expires_at,
                )
                if action == "insert":
                    written += 1
                else:
                    updated += 1

        if written + updated == 0:
            # API unreachable or no relevant mappable markets — seed for schema/API validation.
            logger.warning(
                "No Polymarket signals written (api_failed=%s fetched=%s relevant=%s "
                "skipped_no_country=%s). Loading seed signals (source='seed').",
                api_failed,
                fetched_markets,
                relevant,
                skipped_no_country,
            )
            seeded = seed_signals(cursor, iso_map)
            written += seeded
            logger.info("Seeded %s signal rows", seeded)

    logger.info(
        "Done fetched_markets=%s relevant=%s inserted=%s updated=%s skipped_no_country=%s",
        fetched_markets,
        relevant,
        written,
        updated,
        skipped_no_country,
    )


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_predictions completed successfully")
    except Exception:
        logger.exception("ingest_predictions failed")
        sys.exit(1)
