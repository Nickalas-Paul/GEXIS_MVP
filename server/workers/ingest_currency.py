"""
Ingest ECB/Frankfurter FX volatility into market_signals (Layer 2).

API: https://api.frankfurter.dev/v1/{from}..{to}?base=USD (no auth)
"""

from __future__ import annotations

import logging
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import requests

from config import LOGS_DIR
from db import get_cursor, load_geography_iso_map
from notify_signals import trigger_signal_notifications

SOURCE = "ecb_fx"
SIGNAL_TYPE = "currency_crisis"
REQUEST_TIMEOUT_SEC = 60
WINDOW_DAYS = 30
EXPIRE_DAYS = 7
CV_THRESHOLD = 0.03
MOVE_THRESHOLD = 0.05
AFFECTED_DIMENSIONS = ["taxEnvironment", "marketSizeAndGrowth"]

CURRENCY_TO_ISO3: dict[str, list[str]] = {
    "EUR": [
        "DEU",
        "FRA",
        "ITA",
        "ESP",
        "NLD",
        "BEL",
        "AUT",
        "FIN",
        "IRL",
        "PRT",
        "GRC",
        "LUX",
        "SVK",
        "SVN",
        "EST",
        "LVA",
        "LTU",
        "MLT",
        "CYP",
    ],
    "GBP": ["GBR"],
    "JPY": ["JPN"],
    "CNY": ["CHN"],
    "BRL": ["BRA"],
    "INR": ["IND"],
    "MXN": ["MEX"],
    "KRW": ["KOR"],
    "IDR": ["IDN"],
    "TRY": ["TUR"],
    "ZAR": ["ZAF"],
    "THB": ["THA"],
    "PLN": ["POL"],
    "MYR": ["MYS"],
    "PHP": ["PHL"],
    "SEK": ["SWE"],
    "NOK": ["NOR"],
    "DKK": ["DNK"],
    "CZK": ["CZE"],
    "HUF": ["HUN"],
    "RON": ["ROU"],
    "ILS": ["ISR"],
    "CHF": ["CHE"],
    "SGD": ["SGP"],
    "HKD": ["HKG"],
    "NZD": ["NZL"],
    "AUD": ["AUS"],
    "CAD": ["CAN"],
    "ISK": ["ISL"],
}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_currency.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_currency")


def fetch_history(start: date, end: date) -> dict[str, Any]:
    url = (
        f"https://api.frankfurter.dev/v1/"
        f"{start.isoformat()}..{end.isoformat()}?base=USD"
    )
    response = requests.get(
        url,
        headers={"Accept": "application/json", "User-Agent": "gexis-mvp/1.0"},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    response.raise_for_status()
    return response.json()


def coefficient_of_variation(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = statistics.fmean(values)
    if mean == 0:
        return 0.0
    return statistics.pstdev(values) / abs(mean)


def severity_from_cv(cv: float, directional_only: bool) -> int:
    if directional_only and cv <= CV_THRESHOLD:
        return 3
    if cv > 0.06:
        return 5
    if cv > 0.05:
        return 4
    if cv > 0.04:
        return 3
    if cv > 0.03:
        return 2
    return 3


def upsert_signal(
    cursor,
    *,
    geography_id: str,
    title: str,
    description: Optional[str],
    severity: int,
    direction: str,
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
                direction = %s,
                affected_dimensions = %s,
                probability = NULL,
                event_url = NULL,
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
                AFFECTED_DIMENSIONS,
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
            NULL, false, %s, NOW(), NOW(), NOW()
        )
        """,
        (
            geography_id,
            SOURCE,
            SIGNAL_TYPE,
            title,
            description,
            severity,
            direction,
            AFFECTED_DIMENSIONS,
            expires_at,
        ),
    )
    return "insert"


def ingest() -> None:
    today = date.today()
    start = today - timedelta(days=WINDOW_DAYS)
    payload = fetch_history(start, today)
    rates_by_date = payload.get("rates") or {}
    if not isinstance(rates_by_date, dict) or not rates_by_date:
        logger.warning("Frankfurter returned empty rates")
        return

    dates = sorted(rates_by_date.keys())
    logger.info(
        "Frankfurter history: %s days from %s to %s",
        len(dates),
        dates[0],
        dates[-1],
    )

    # currency -> list of values in date order
    series: dict[str, list[float]] = {ccy: [] for ccy in CURRENCY_TO_ISO3}
    for d in dates:
        day_rates = rates_by_date.get(d) or {}
        if not isinstance(day_rates, dict):
            continue
        for ccy in CURRENCY_TO_ISO3:
            val = day_rates.get(ccy)
            if val is None:
                continue
            try:
                series[ccy].append(float(val))
            except (TypeError, ValueError):
                continue

    flags: list[tuple[str, float, float, bool]] = []
    # (ccy, cv, pct_change, directional_only)
    for ccy, values in series.items():
        if len(values) < 2:
            continue
        cv = coefficient_of_variation(values)
        first, last = values[0], values[-1]
        # Rate is foreign per USD: rise = FX weakened vs USD
        pct_change = ((last - first) / first) * 100.0 if first else 0.0
        weakened = pct_change > 0  # more foreign currency per USD
        big_move = abs(pct_change) / 100.0 >= MOVE_THRESHOLD and weakened
        high_vol = cv > CV_THRESHOLD
        if not high_vol and not big_move:
            continue
        directional_only = big_move and not high_vol
        flags.append((ccy, cv, pct_change, directional_only))

    logger.info("Flagged %s high-vol/move currencies", len(flags))
    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    inserted = updated = skipped_geo = 0

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)
        for ccy, cv, pct_change, directional_only in flags:
            severity = severity_from_cv(cv, directional_only)
            direction = "negative" if pct_change > 0 else "neutral"
            title = (
                f"{ccy} lost {pct_change:.2f}% against USD over 30 days "
                f"(volatility: {cv:.1%})"
            )
            description = (
                f"CV={cv:.4f}; 30d change={pct_change:+.2f}% vs USD "
                f"(Frankfurter/ECB rates)"
            )
            for iso3 in CURRENCY_TO_ISO3[ccy]:
                geography_id = iso_map.get(iso3)
                if not geography_id:
                    skipped_geo += 1
                    continue
                action = upsert_signal(
                    cursor,
                    geography_id=geography_id,
                    title=title,
                    description=description,
                    severity=severity,
                    direction=direction,
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
    logger.info("ingest_currency completed successfully")


def main() -> None:
    configure_logging()
    try:
        ingest()
    except Exception:
        logger.exception("ingest_currency failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
