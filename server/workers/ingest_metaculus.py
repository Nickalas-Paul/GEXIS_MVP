"""
Ingest Metaculus forecasting questions into market_signals (Layer 2).

API: https://www.metaculus.com/api/posts/
Auth: Authorization: Token $METACULUS_API_TOKEN
"""

from __future__ import annotations

import json
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
from signal_common import (
    classify_signal,
    extract_iso_codes,
    has_negative_keyword,
    severity_from_probability,
)

SOURCE = "metaculus"
POSTS_URL = "https://www.metaculus.com/api/posts/"
REQUEST_TIMEOUT_SEC = 60
PAGE_LIMIT = 100
MAX_PAGES = 5
PAGE_DELAY_SEC = 1.0

SEARCH_QUERIES = [
    "tariff",
    "sanctions",
    "recession",
    "inflation",
    "trade agreement",
    "debt ceiling",
    "government shutdown",
    "currency",
    "GDP",
]


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "ingest_metaculus.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("ingest_metaculus")


def api_token() -> Optional[str]:
    return (
        os.getenv("METACULUS_API_TOKEN")
        or os.getenv("METACULUS_TOKEN")
        or ""
    ).strip() or None


def auth_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Token {token}",
        "User-Agent": "GEXIS-MVP/0.1 (data-engine)",
        "Accept": "application/json",
    }


def extract_community_probability(question: dict[str, Any]) -> Optional[float]:
    """
    Try known Metaculus aggregation shapes for a binary community forecast.
    Returns None if unavailable or not a usable 0–1 probability.
    """
    if question.get("type") and question.get("type") != "binary":
        return None

    aggregations = question.get("aggregations")
    if isinstance(aggregations, dict):
        for method in (
            "recency_weighted",
            "unweighted",
            "metaculus_prediction",
            "single_aggregation",
        ):
            block = aggregations.get(method)
            if not isinstance(block, dict):
                continue
            latest = block.get("latest")
            if latest is None:
                continue
            if isinstance(latest, (int, float)):
                val = float(latest)
                if 0 <= val <= 1:
                    return val
            if isinstance(latest, dict):
                for key in (
                    "center",
                    "centers",
                    "q2",
                    "median",
                    "probability_yes",
                    "pred",
                    "value",
                ):
                    raw = latest.get(key)
                    if isinstance(raw, list) and raw:
                        raw = raw[0]
                    try:
                        val = float(raw)
                    except (TypeError, ValueError):
                        continue
                    if 0 <= val <= 1:
                        return val

    for key in ("community_prediction", "probability_yes", "cp"):
        raw = question.get(key)
        if isinstance(raw, dict):
            for sub in ("full", "q2", "median", "center"):
                try:
                    val = float(raw.get(sub))
                    if 0 <= val <= 1:
                        return val
                except (TypeError, ValueError):
                    continue
        else:
            try:
                val = float(raw)
                if 0 <= val <= 1:
                    return val
            except (TypeError, ValueError):
                continue

    return None


def parse_expires_at(post: dict[str, Any], question: dict[str, Any]) -> datetime:
    for key in (
        "scheduled_close_time",
        "scheduled_resolve_time",
        "actual_close_time",
    ):
        for obj in (question, post):
            raw = obj.get(key)
            if not raw:
                continue
            try:
                text = str(raw).replace("Z", "+00:00")
                return datetime.fromisoformat(text).astimezone(timezone.utc)
            except ValueError:
                continue
    return datetime.now(timezone.utc) + timedelta(days=180)


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


def fetch_posts(token: str, *, search: Optional[str], offset: int) -> dict[str, Any]:
    params: dict[str, Any] = {
        "type": "forecast",
        "status": "open",
        "limit": PAGE_LIMIT,
        "offset": offset,
        "with_cp": "true",
    }
    if search:
        params["search"] = search
    response = requests.get(
        POSTS_URL,
        params=params,
        headers=auth_headers(token),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    if response.status_code == 403:
        logger.error(
            "Metaculus returned 403 — token invalid, expired, or lacking permission. "
            "Body: %s",
            (response.text or "")[:400],
        )
        raise PermissionError("Metaculus 403")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected Metaculus payload type: {type(payload)}")
    return payload


def collect_posts(token: str) -> list[dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {}
    logged_structure = False

    for search in [None, *SEARCH_QUERIES]:
        for page in range(MAX_PAGES):
            offset = page * PAGE_LIMIT
            try:
                payload = fetch_posts(token, search=search, offset=offset)
            except PermissionError:
                raise
            except Exception:
                logger.exception(
                    "Metaculus fetch failed search=%r offset=%s", search, offset
                )
                break

            results = payload.get("results")
            if not isinstance(results, list) or not results:
                break

            if not logged_structure and results:
                first = results[0]
                question = first.get("question") if isinstance(first, dict) else None
                logger.info(
                    "Metaculus first-result structure: post_keys=%s question_keys=%s "
                    "question.type=%s aggregations=%s",
                    sorted(first.keys()) if isinstance(first, dict) else None,
                    sorted(question.keys())
                    if isinstance(question, dict)
                    else None,
                    question.get("type") if isinstance(question, dict) else None,
                    json.dumps(
                        question.get("aggregations")
                        if isinstance(question, dict)
                        else None,
                        default=str,
                    )[:800],
                )
                logged_structure = True

            for post in results:
                if not isinstance(post, dict):
                    continue
                pid = post.get("id")
                if isinstance(pid, int):
                    by_id[pid] = post

            logger.info(
                "search=%r page=%s got=%s unique=%s",
                search,
                page,
                len(results),
                len(by_id),
            )
            if len(results) < PAGE_LIMIT:
                break
            time.sleep(PAGE_DELAY_SEC)

        time.sleep(PAGE_DELAY_SEC)

    return list(by_id.values())


def ingest() -> None:
    token = api_token()
    if not token:
        logger.error(
            "METACULUS_API_TOKEN is not set. Export the token and re-run."
        )
        sys.exit(1)

    try:
        posts = collect_posts(token)
    except PermissionError:
        logger.error("Aborting Metaculus ingest due to 403.")
        sys.exit(0)

    fetched = len(posts)
    relevant = 0
    inserted = 0
    updated = 0
    skipped_non_binary = 0
    skipped_no_prob = 0
    skipped_no_country = 0
    seen: set[tuple[str, str]] = set()

    logger.info("Collected %s unique Metaculus posts", fetched)

    with get_cursor() as cursor:
        iso_map = load_geography_iso_map(cursor)

        for post in posts:
            title = (post.get("title") or post.get("short_title") or "").strip()
            if not title:
                continue
            question = post.get("question")
            if not isinstance(question, dict):
                continue

            q_type = question.get("type")
            if q_type and q_type != "binary":
                skipped_non_binary += 1
                continue

            blob = f"{title} {question.get('description') or ''}"
            if has_negative_keyword(blob):
                continue

            classified = classify_signal(blob)
            if classified is None:
                continue

            probability = extract_community_probability(question)
            if probability is None:
                skipped_no_prob += 1
                continue

            signal_type, dims, direction = classified
            isos = extract_iso_codes(blob, default_usa_on_us_topic=True)
            if not isos:
                skipped_no_country += 1
                continue

            relevant += 1
            description = question.get("description") or post.get("short_title")
            if isinstance(description, str) and len(description) > 500:
                description = description[:497] + "..."
            elif not isinstance(description, str):
                description = None

            slug = post.get("slug") or post.get("id")
            event_url = (
                f"https://www.metaculus.com/questions/{slug}/" if slug else None
            )
            expires_at = parse_expires_at(post, question)
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
                    description=description,
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
        "skipped_non_binary=%s skipped_no_prob=%s skipped_no_country=%s",
        fetched,
        relevant,
        inserted,
        updated,
        skipped_non_binary,
        skipped_no_prob,
        skipped_no_country,
    )
    if skipped_no_prob and inserted + updated == 0:
        logger.warning(
            "No Metaculus signals written — community prediction fields were null "
            "on binary questions (aggregations.*.latest empty). Token can list "
            "posts but may lack aggregation_explorer / CP access."
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
        logger.info("ingest_metaculus completed successfully")
    except SystemExit:
        raise
    except Exception:
        logger.exception("ingest_metaculus failed")
        sys.exit(1)
