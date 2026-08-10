"""
Ingest Kalshi prediction-market signals into market_signals (Layer 2).

API: https://api.elections.kalshi.com/trade-api/v2/markets?status=open
No auth required for public market reads.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications
from signal_common import (
    classify_signal,
    extract_iso_codes,
    has_negative_keyword,
    severity_from_probability,
)

SOURCE = "kalshi"
MARKETS_URL = "https://api.elections.kalshi.com/trade-api/v2/markets"
REQUEST_TIMEOUT_SEC = 60
PAGE_LIMIT = 100
MAX_MARKETS = 500

# Curated economics/politics series so we are not drowned by sports MVEs.
CURATED_SERIES = [
    "KXGDP",
    "KXFED",
    "FED",
    "KXCPI",
    "CPI",
    "KXGOVTSHUTDOWN",
    "GOVSHUT",
    "DCEIL",
    "KXFTA",
    "KXNEWDEAL",
    "KXRATECUT",
    "KXFEDHIKE",
    "KXTARIFFSGLOBAL",
    "KXTARIFFSMEX",
    "KXTARIFFSEU",
    "KXTARIFFPRC",
    "KXSANCTIONRUS",
    "KXSANCTION",
    "KXRECSSNBER",
    "KXTRADEDEALPRC",
    "KXPCECORE",
    "PCECORE",
    "KXDEBTLEVEL",
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_kalshi.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_kalshi")


def parse_probability(market: dict[str, Any]) -> Optional[float]:
    """
    Prefer yes_bid_dollars (0–1 string), then last_price_dollars,
    then legacy yes_bid in cents (1–99).
    """
    for key in ("yes_bid_dollars", "last_price_dollars", "yes_ask_dollars"):
        raw = market.get(key)
        if raw is None or raw == "":
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if val <= 0 or val > 1:
            continue
        return val

    raw_cents = market.get("yes_bid")
    if raw_cents is not None:
        try:
            cents = float(raw_cents)
        except (TypeError, ValueError):
            return None
        if cents <= 0:
            return None
        # Heuristic: values > 1 are cents
        if cents > 1:
            cents = cents / 100.0
        if 0 < cents <= 1:
            return cents
    return None


def parse_expires_at(market: dict[str, Any]) -> datetime:
    for key in ("close_time", "expiration_time", "expected_expiration_time"):
        raw = market.get(key)
        if not raw:
            continue
        try:
            text = str(raw).replace("Z", "+00:00")
            return datetime.fromisoformat(text).astimezone(timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc) + timedelta(days=90)


def market_event_url(market: dict[str, Any]) -> str:
    ticker = market.get("ticker") or market.get("event_ticker") or ""
    if ticker:
        return f"https://kalshi.com/markets/{ticker}"
    return "https://kalshi.com"


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    title: str,
    description: Optional[str],
    probability: float,
    severity: int,
    direction: str,
    signal_type: str,
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
        (SOURCE, title, geography_id),
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            """
            UPDATE market_signals
            SET probability = %s,
                severity = %s,
                direction = %s,
                signal_type = %s,
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
                signal_type,
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
            SOURCE,
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


def fetch_markets_page(
    *, cursor: Optional[str] = None, series_ticker: Optional[str] = None
) -> tuple[list[dict[str, Any]], Optional[str]]:
    params: dict[str, Any] = {"limit": PAGE_LIMIT, "status": "open"}
    if cursor:
        params["cursor"] = cursor
    if series_ticker:
        params["series_ticker"] = series_ticker
    response = requests.get(
        MARKETS_URL,
        params=params,
        headers={"User-Agent": "GEXIS-MVP/0.1 (data-engine)"},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    payload = response.json()
    markets = payload.get("markets") if isinstance(payload, dict) else None
    next_cursor = payload.get("cursor") if isinstance(payload, dict) else None
    if not isinstance(markets, list):
        return [], None
    return [m for m in markets if isinstance(m, dict)], (
        str(next_cursor) if next_cursor else None
    )


def collect_markets() -> list[dict[str, Any]]:
    by_ticker: dict[str, dict[str, Any]] = {}

    # 1) Curated economics / geopolitics series
    for series in CURATED_SERIES:
        try:
            markets, _ = fetch_markets_page(series_ticker=series)
            logger.info("Series %s -> %s markets", series, len(markets))
            for m in markets:
                ticker = str(m.get("ticker") or "")
                if ticker:
                    by_ticker[ticker] = m
        except Exception:
            logger.exception("Failed fetching Kalshi series %s", series)

    # 2) Paginate general open markets (cap MAX_MARKETS)
    cursor: Optional[str] = None
    pages = 0
    while len(by_ticker) < MAX_MARKETS:
        try:
            markets, cursor = fetch_markets_page(cursor=cursor)
        except Exception:
            logger.exception("Failed paginating Kalshi open markets")
            break
        pages += 1
        if not markets:
            break
        for m in markets:
            ticker = str(m.get("ticker") or "")
            if ticker and ticker not in by_ticker:
                by_ticker[ticker] = m
                if len(by_ticker) >= MAX_MARKETS:
                    break
        logger.info(
            "Open markets page %s -> +%s (unique total=%s)",
            pages,
            len(markets),
            len(by_ticker),
        )
        if not cursor:
            break

    return list(by_ticker.values())


def market_blob(market: dict[str, Any]) -> str:
    parts = [
        market.get("title"),
        market.get("subtitle"),
        market.get("yes_sub_title"),
        market.get("no_sub_title"),
        market.get("rules_primary"),
        market.get("event_ticker"),
        market.get("ticker"),
    ]
    return " ".join(str(p) for p in parts if p)


def ingest() -> None:
    fetched = 0
    relevant = 0
    inserted = 0
    updated = 0
    skipped_no_prob = 0
    skipped_no_country = 0
    seen: set[tuple[str, str]] = set()

    markets = collect_markets()
    fetched = len(markets)
    logger.info("Collected %s unique Kalshi markets", fetched)

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        for market in markets:
            if str(market.get("status") or "").lower() in {"closed", "settled"}:
                continue

            title = (market.get("title") or "").strip()
            if not title:
                continue

            blob = market_blob(market)
            if has_negative_keyword(blob):
                continue

            classified = classify_signal(blob)
            if classified is None:
                continue

            probability = parse_probability(market)
            if probability is None:
                skipped_no_prob += 1
                continue

            signal_type, dims, direction = classified
            isos = extract_iso_codes(blob, default_usa_on_us_topic=True)
            if not isos:
                skipped_no_country += 1
                continue

            relevant += 1
            description = market.get("rules_primary")
            if isinstance(description, str) and len(description) > 500:
                description = description[:497] + "..."
            elif not isinstance(description, str):
                description = market.get("subtitle") or market.get("yes_sub_title")

            expires_at = parse_expires_at(market)
            event_url = market_event_url(market)
            severity = severity_from_probability(probability)

            for iso in isos:
                if iso not in iso_map:
                    continue
                key = (title, iso)
                if key in seen:
                    continue
                seen.add(key)
                action = upsert_signal(
                    cursor,
                    geography_id=iso_map[iso],
                    title=title[:500],
                    description=description if isinstance(description, str) else None,
                    probability=probability,
                    severity=severity,
                    direction=direction,
                    signal_type=signal_type,
                    affected_dimensions=dims,
                    event_url=event_url,
                    expires_at=expires_at,
                )
                if action == "insert":
                    inserted += 1
                else:
                    updated += 1

    logger.info(
        "Done fetched=%s relevant=%s inserted=%s updated=%s "
        "skipped_no_prob=%s skipped_no_country=%s",
        fetched,
        relevant,
        inserted,
        updated,
        skipped_no_prob,
        skipped_no_country,
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
        logger.info("ingest_kalshi completed successfully")
    except Exception:
        logger.exception("ingest_kalshi failed")
        sys.exit(1)
