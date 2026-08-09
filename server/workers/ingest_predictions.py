"""
Ingest prediction-market signals into market_signals (Layer 2).

Primary source: Polymarket Gamma public-search API
  GET https://gamma-api.polymarket.com/public-search?q={keyword}

Uses phrase-based classification, negative keyword filters, and word-boundary
country extraction. Falls back to source='seed' if the API yields nothing usable.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from country_aliases import NAME_TO_ISO
from db import get_cursor, load_geography_iso_map

SOURCE = "polymarket"
SEED_SOURCE = "seed"
GAMMA_SEARCH_URL = "https://gamma-api.polymarket.com/public-search"
GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events"
REQUEST_TIMEOUT_SEC = 60
MAX_RETRIES = 3
MIN_VOLUME = 10_000.0
ACTIVE_EVENTS_PAGES = 3
ACTIVE_EVENTS_LIMIT = 100

SEARCH_KEYWORDS = [
    "impose tariff",
    "trade war",
    "economic sanctions",
    "trade deal",
    "free trade",
    "recession",
    "currency devaluation",
    "political crisis",
    "regulatory reform",
    "import duty",
]

NEGATIVE_KEYWORDS = [
    "ai model",
    "social media",
    "sports",
    "entertainment",
    "celebrity",
    "movie",
    "music",
    "video game",
    "app store",
    "streaming",
    "tennis",
    "football",
    "nba",
    "mlb",
    "soccer",
]

# Phrase rules: first matching rule wins (more specific first).
SIGNAL_RULES: list[tuple[tuple[str, ...], str, list[str], str]] = [
    (
        (
            "impose tariff",
            "impose tariffs",
            "new tariff",
            "new tariffs",
            "tariff on",
            "tariffs on",
            "import duty",
            "trade war",
            "import tax",
            "tariff increase",
            "tariff hike",
            "tariff reduction",
            "china tariff",
            "us tariff",
        ),
        "tariff_risk",
        ["taxEnvironment", "competitorSaturation"],
        "negative",
    ),
    (
        (
            "economic sanction",
            "economic sanctions",
            "impose sanctions",
            "sanction against",
            "sanctions against",
            "sanctions on",
            "trade embargo",
            "export control",
            "export controls",
            "embargo on",
        ),
        "sanctions",
        ["regulatoryEase", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        (
            "trade deal",
            "trade agreement",
            "free trade",
            "trade pact",
            "fta ",
            " fta",
        ),
        "trade_agreement",
        ["marketSizeAndGrowth", "competitorSaturation"],
        "positive",
    ),
    (
        (
            "new regulation",
            "regulatory reform",
            "deregulation",
            "compliance requirement",
            "policy change",
            "business regulation",
            "capital gains tax",
        ),
        "regulatory_change",
        ["regulatoryEase"],
        "neutral",
    ),
    (
        (
            "coup",
            "political crisis",
            "regime change",
            "civil unrest",
            "government collapse",
            "impeachment",
            "martial law",
        ),
        "political_instability",
        ["regulatoryEase", "trajectory"],
        "negative",
    ),
    (
        (
            "currency devaluation",
            "currency crisis",
            "exchange rate collapse",
            "hyperinflation",
            "dollarize",
            "dollarization",
        ),
        "currency_crisis",
        ["taxEnvironment", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        (
            "recession",
            "gdp contraction",
            "interest rate",
            "central bank",
            "economic downturn",
            "fiscal policy",
            "rate cut",
            "rate hike",
            "fed rate",
        ),
        "economic_policy",
        ["marketSizeAndGrowth", "trajectory"],
        "neutral",
    ),
]

EU_TOP5 = ["DEU", "FRA", "ITA", "ESP", "NLD"]
BRICS = ["BRA", "RUS", "IND", "CHN", "ZAF"]

# Abbreviations with word-boundary patterns → ISO3 (or multi via special keys)
ABBREV_PATTERNS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"\b(?:u\.?s\.?a\.?|united states(?: of america)?)\b", re.I), ["USA"]),
    (re.compile(r"\b(?:u\.?k\.?|united kingdom|britain|great britain)\b", re.I), ["GBR"]),
    (re.compile(r"\b(?:european union|eurozone)\b", re.I), EU_TOP5),
    (re.compile(r"\beu\b", re.I), EU_TOP5),
    (re.compile(r"\bbrics\b", re.I), BRICS),
]

# Demonyms / aliases with word boundaries (not currency-driven).
DEMONYM_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bchinese\b", re.I), "CHN"),
    (re.compile(r"\bmexican\b", re.I), "MEX"),
    (re.compile(r"\bcanadian\b", re.I), "CAN"),
    (re.compile(r"\bjapanese\b", re.I), "JPN"),
    (re.compile(r"\bindian\b", re.I), "IND"),
    (re.compile(r"\bbrazilian\b", re.I), "BRA"),
    (re.compile(r"\brussian\b", re.I), "RUS"),
    (re.compile(r"\bukrainian\b", re.I), "UKR"),
    (re.compile(r"\biranian\b", re.I), "IRN"),
    (re.compile(r"\bisraeli\b", re.I), "ISR"),
    (re.compile(r"\bsouth korean\b", re.I), "KOR"),
    (re.compile(r"\bnorth korean\b", re.I), "PRK"),
    (re.compile(r"\btaiwanese\b", re.I), "TWN"),
    (re.compile(r"\baustralian\b", re.I), "AUS"),
    (re.compile(r"\bvietnamese\b", re.I), "VNM"),
    (re.compile(r"\bturkish\b", re.I), "TUR"),
    (re.compile(r"\bgerman\b", re.I), "DEU"),
    (re.compile(r"\bfrench\b", re.I), "FRA"),
    (re.compile(r"\bcuban\b", re.I), "CUB"),
    (re.compile(r"\bargentine\b", re.I), "ARG"),
]

# Currency phrases that should NOT alone create country mappings.
CURRENCY_NOISE = re.compile(
    r"\b(?:us dollar|u\.?s\.? dollar|usd|greenback|yen|euro|renminbi|yuan|"
    r"pound sterling|gbp|jpy|cny|mxn)\b",
    re.I,
)


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
    p = prices[0]
    if p < 0 or p > 1:
        return None
    return p


def market_volume(market: dict[str, Any]) -> float:
    for key in ("volumeNum", "volume", "volumeClob", "liquidityNum", "liquidity"):
        val = market.get(key)
        if val is None:
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return 0.0


def has_negative_keyword(text: str) -> bool:
    lower = text.lower()
    return any(term in lower for term in NEGATIVE_KEYWORDS)


def classify_signal(text: str) -> Optional[tuple[str, list[str], str]]:
    if has_negative_keyword(text):
        return None
    lower = text.lower()
    for phrases, signal_type, dims, direction in SIGNAL_RULES:
        if any(p in lower for p in phrases):
            return signal_type, dims, direction
    return None


def _country_name_patterns() -> list[tuple[re.Pattern[str], str]]:
    """Build word-boundary patterns from NAME_TO_ISO (longer names first)."""
    patterns: list[tuple[re.Pattern[str], str]] = []
    for name, iso in sorted(NAME_TO_ISO.items(), key=lambda kv: len(kv[0]), reverse=True):
        if len(name) < 4 and name not in {"iran", "iraq", "oman", "peru", "cuba", "chad", "fiji", "togo", "mali"}:
            # Skip very short ambiguous tokens except known short country names.
            if name not in {"iran", "iraq", "oman", "peru", "cuba", "chad", "fiji", "togo", "mali", "laos"}:
                continue
        escaped = re.escape(name)
        patterns.append((re.compile(rf"\b{escaped}\b", re.I), iso))
    return patterns


_COUNTRY_NAME_PATTERNS = _country_name_patterns()


def extract_iso_codes(text: str) -> list[str]:
    """Word-boundary country extraction; ignores currency-only mentions."""
    found: set[str] = set()

    for pattern, isos in ABBREV_PATTERNS:
        if pattern.search(text):
            found.update(isos)

    for pattern, iso in DEMONYM_PATTERNS:
        if pattern.search(text):
            found.add(iso)

    for pattern, iso in _COUNTRY_NAME_PATTERNS:
        if pattern.search(text):
            found.add(iso)

    # If the only country hits came from currency noise context with no real
    # country name beyond USD/JPY style mentions, drop USA/JPN false positives.
    # Example: "US dollar strengthens against yen" — strip unless a non-currency
    # country phrase also appears.
    if CURRENCY_NOISE.search(text):
        # Keep countries only if matched via explicit country/demonym beyond
        # the "US" inside "US dollar".
        text_wo_currency = CURRENCY_NOISE.sub(" ", text)
        kept: set[str] = set()
        for pattern, isos in ABBREV_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.update(isos)
        for pattern, iso in DEMONYM_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.add(iso)
        for pattern, iso in _COUNTRY_NAME_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.add(iso)
        # Currency-crisis markets about dollarization may only say Argentina + USD —
        # ARG stays via country name; USA from "US dollar" alone is dropped.
        found = kept

    return sorted(found)


def _markets_from_events(events: list[Any]) -> list[dict[str, Any]]:
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


def fetch_search(keyword: str) -> list[dict[str, Any]]:
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
            return _markets_from_events(events)
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


def fetch_active_events_markets() -> list[dict[str, Any]]:
    """Paginate active/open Polymarket events (public-search often returns closed)."""
    all_markets: list[dict[str, Any]] = []
    for page in range(ACTIVE_EVENTS_PAGES):
        offset = page * ACTIVE_EVENTS_LIMIT
        try:
            response = requests.get(
                GAMMA_EVENTS_URL,
                params={
                    "limit": ACTIVE_EVENTS_LIMIT,
                    "offset": offset,
                    "active": "true",
                    "closed": "false",
                    "order": "volume",
                    "ascending": "false",
                },
                headers={"User-Agent": "GEXIS-MVP/0.1 (data-engine)"},
                timeout=REQUEST_TIMEOUT_SEC,
            )
            response.raise_for_status()
            events = response.json()
            if not isinstance(events, list) or not events:
                break
            batch = _markets_from_events(events)
            logger.info(
                "Active events page offset=%s -> %s events / %s markets",
                offset,
                len(events),
                len(batch),
            )
            all_markets.extend(batch)
        except Exception:
            logger.exception("Failed fetching active Polymarket events offset=%s", offset)
            break
    return all_markets


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
            "title": "Will the US impose new tariffs on Chinese goods above 40% by end of 2026?",
            "description": "Seed signal tracking US–China tariff escalation.",
            "probability": 0.58,
            "direction": "negative",
            "affected_dimensions": ["taxEnvironment", "competitorSaturation"],
            "event_url": "https://polymarket.com/",
            "expires_at": now + timedelta(days=150),
        },
        {
            "isos": ["CHN"],
            "signal_type": "sanctions",
            "title": "Will new economic sanctions or export controls against China take effect in 2026?",
            "description": "Seed signal for tech-export sanctions.",
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
            "isos": ["USA"],
            "signal_type": "economic_policy",
            "title": "Will the US enter a recession by end of 2026?",
            "description": "Seed macro signal for market-size and trajectory projections.",
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
    skipped_negative = 0
    api_failed = False
    seen_keys: set[tuple[str, str]] = set()

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

        try:
            active_batch = fetch_active_events_markets()
            logger.info("Active events crawl returned %s markets", len(active_batch))
            all_markets.extend(active_batch)
        except Exception:
            api_failed = True
            logger.exception("Polymarket active events crawl failed")

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
            if has_negative_keyword(blob):
                skipped_negative += 1
                continue

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
            logger.warning(
                "No Polymarket signals written (api_failed=%s fetched=%s relevant=%s "
                "skipped_no_country=%s skipped_negative=%s). Loading seed signals.",
                api_failed,
                fetched_markets,
                relevant,
                skipped_no_country,
                skipped_negative,
            )
            seeded = seed_signals(cursor, iso_map)
            written += seeded
            logger.info("Seeded %s signal rows", seeded)

    logger.info(
        "Done fetched_markets=%s relevant=%s inserted=%s updated=%s "
        "skipped_no_country=%s skipped_negative=%s",
        fetched_markets,
        relevant,
        written,
        updated,
        skipped_no_country,
        skipped_negative,
    )


if __name__ == "__main__":
    configure_logging()
    try:
        ingest()
        logger.info("ingest_predictions completed successfully")
    except Exception:
        logger.exception("ingest_predictions failed")
        sys.exit(1)
