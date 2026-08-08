"""
MVI scoring engine.

Reads raw_indicators + scoring_config, writes mvi_scores for industry_vertical
'all_industries'. Deterministic: same inputs produce the same scores.

Dependency order:
    1. python compute_trends.py   # writes trend_scores used for Trajectory
    2. python compute_mvi.py      # this module — reads trend_scores

Trajectory is a composite 7th dimension derived from trend_scores (direction /
annualized_rate of the six base dimensions), not from raw_indicators.

Usage:
    python compute_mvi.py
"""

from __future__ import annotations

import logging
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from psycopg2.extras import Json

from config import LOGS_DIR
from db import get_cursor
from scoring_config import (
    BASE_DIMENSION_KEYS,
    DIMENSIONS,
    INDUSTRY_VERTICAL,
    MIN_DIMENSIONS_FOR_OVERALL,
    VERTICAL_WEIGHTS,
)


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "compute_mvi.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("compute_mvi")


def round_score(value: float) -> int:
    return int(round(value))


def transform_for_norm(value: float, normalization: str) -> float | None:
    if normalization == "log_scale":
        if value <= 0:
            return None
        return math.log10(value)
    return value


def min_max_normalize(
    transformed: dict[str, float],
    direction: str,
) -> dict[str, float]:
    """Normalize transformed values to 0–100 across countries."""
    if not transformed:
        return {}
    values = list(transformed.values())
    vmin = min(values)
    vmax = max(values)
    out: dict[str, float] = {}
    for geo_id, value in transformed.items():
        if vmax == vmin:
            score = 50.0
        else:
            score = (value - vmin) / (vmax - vmin) * 100.0
        if direction == "lower_is_better":
            score = 100.0 - score
        out[geo_id] = score
    return out


def fetch_latest_indicator_values(
    cursor,
    source: str,
    code: str,
) -> dict[str, tuple[float, int]]:
    """
    Most recent non-null value per geography for one indicator.
    Returns {geography_id: (value, year)}.
    """
    cursor.execute(
        """
        SELECT DISTINCT ON (geography_id)
            geography_id::text,
            value::float8,
            year
        FROM raw_indicators
        WHERE source = %s
          AND indicator_code = %s
          AND value IS NOT NULL
        ORDER BY geography_id, year DESC
        """,
        (source, code),
    )
    return {row[0]: (float(row[1]), int(row[2])) for row in cursor.fetchall()}


def fetch_trend_rates(cursor) -> dict[str, dict[str, float]]:
    """
    Load annualized_rate per geography × base dimension from trend_scores.
    Returns {geography_id: {dimension: annualized_rate}}.
    """
    cursor.execute(
        """
        SELECT geography_id::text, dimension, annualized_rate::float8
        FROM trend_scores
        WHERE annualized_rate IS NOT NULL
        """
    )
    out: dict[str, dict[str, float]] = defaultdict(dict)
    for geo_id, dimension, rate in cursor.fetchall():
        if dimension not in BASE_DIMENSION_KEYS:
            continue
        out[geo_id][dimension] = float(rate)
    return out


def rate_to_trend_score(rate: float) -> float:
    """
    Smooth map of annualized rate (pts/year on 0–100 scale) → 0–100 trend score.

    Calibration (guidelines, not hard bins):
      ≤ -3 → ~10–15;  -1 → ~25–35;  0 → ~50;  +1 → ~65–75;  ≥ +3 → ~85–95
    """
    # tanh scale chosen so mid-range rates land in the guideline bands
    score = 50.0 + 40.0 * math.tanh(rate / 2.0)
    return float(min(100.0, max(0.0, score)))


def compute_trajectory_score(
    dim_rates: dict[str, float],
    vertical_weights: dict[str, float],
) -> float | None:
    """
    Weighted average of per-dimension trend scores using the same vertical
    weights as the base dimensions (missing dims redistribute).
    """
    parts: list[tuple[float, float]] = []
    for dim_key in BASE_DIMENSION_KEYS:
        if dim_key not in dim_rates:
            continue
        weight = float(vertical_weights.get(dim_key, 0.0))
        if weight <= 0:
            continue
        parts.append((rate_to_trend_score(dim_rates[dim_key]), weight))
    return weighted_average(parts)


def weighted_average(
    parts: list[tuple[float, float]],
) -> float | None:
    """parts = [(score, weight), ...]; re-weights among available parts."""
    if not parts:
        return None
    total_weight = sum(w for _, w in parts)
    if total_weight <= 0:
        return None
    return sum(score * (weight / total_weight) for score, weight in parts)


def compute_confidence(
    dimensions_scored: int,
    indicators_present: int,
    indicators_total: int,
    used_proxy: bool,
) -> str:
    """
    High: 6–7 dimensions scored and ≥60% indicator coverage (proxy caps to medium).
    Medium: 4–5 dimensions scored, or ≥30% coverage.
    Low: 1–3 dimensions scored or <30% coverage.
    """
    coverage = (
        (indicators_present / indicators_total) if indicators_total > 0 else 0.0
    )
    if dimensions_scored >= 6 and coverage >= 0.60:
        level = "high"
    elif dimensions_scored >= 4 or coverage >= 0.30:
        level = "medium"
    else:
        level = "low"

    # Proxy-only dimensions (e.g. talentDensity WB proxy) cap at medium.
    if used_proxy and level == "high":
        level = "medium"
    return level


def upsert_mvi_score(
    cursor,
    geography_id: str,
    overall_score: int | None,
    dimensions: dict[str, int | None],
    confidence: str,
    data_freshness: datetime | None,
    sources: list[dict[str, Any]],
) -> None:
    cursor.execute(
        """
        INSERT INTO mvi_scores (
            geography_id,
            industry_vertical,
            overall_score,
            dimensions,
            confidence,
            data_freshness,
            sources,
            calculated_at
        )
        VALUES (
            %(geography_id)s,
            %(industry_vertical)s,
            %(overall_score)s,
            %(dimensions)s,
            %(confidence)s,
            %(data_freshness)s,
            %(sources)s,
            NOW()
        )
        ON CONFLICT (geography_id, industry_vertical)
        DO UPDATE SET
            overall_score = EXCLUDED.overall_score,
            dimensions = EXCLUDED.dimensions,
            confidence = EXCLUDED.confidence,
            data_freshness = EXCLUDED.data_freshness,
            sources = EXCLUDED.sources,
            calculated_at = NOW()
        """,
        {
            "geography_id": geography_id,
            "industry_vertical": INDUSTRY_VERTICAL,
            "overall_score": overall_score,
            "dimensions": Json(dimensions),
            "confidence": confidence,
            "data_freshness": data_freshness,
            "sources": Json(sources),
        },
    )


def compute_all() -> None:
    vertical_weights = VERTICAL_WEIGHTS[INDUSTRY_VERTICAL]
    total_configured_indicators = sum(
        len(dim["indicators"])
        for dim in DIMENSIONS.values()
        if not dim.get("is_composite")
    )

    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT id::text
            FROM geographies
            WHERE region_type = 'country'
            ORDER BY name
            """
        )
        geography_ids = [row[0] for row in cursor.fetchall()]
        logger.info(
            "Scoring %s countries for vertical=%s (7-dimension model)",
            len(geography_ids),
            INDUSTRY_VERTICAL,
        )

        trend_rates = fetch_trend_rates(cursor)
        logger.info(
            "Loaded trend rates for %s geographies (for Trajectory)",
            len(trend_rates),
        )

        # Per indicator: normalized scores + provenance
        # indicator_scores[dim_key][indicator_index] = {geo_id: score}
        indicator_scores: dict[str, list[dict[str, float]]] = {}
        indicator_years: dict[str, list[dict[str, int]]] = {}

        for dim_key in BASE_DIMENSION_KEYS:
            dim_cfg = DIMENSIONS[dim_key]
            indicator_scores[dim_key] = []
            indicator_years[dim_key] = []

            for ind in dim_cfg["indicators"]:
                raw = fetch_latest_indicator_values(cursor, ind["source"], ind["code"])
                transformed: dict[str, float] = {}
                years: dict[str, int] = {}
                for geo_id, (value, year) in raw.items():
                    tval = transform_for_norm(value, ind["normalization"])
                    if tval is None:
                        continue
                    transformed[geo_id] = tval
                    years[geo_id] = year

                normalized = min_max_normalize(transformed, ind["direction"])
                indicator_scores[dim_key].append(normalized)
                indicator_years[dim_key].append(years)
                logger.info(
                    "Indicator %s/%s: %s countries with data",
                    ind["source"],
                    ind["code"],
                    len(normalized),
                )

        scored = 0
        null_overall = 0
        confidence_counts: dict[str, int] = defaultdict(int)
        trajectory_present = 0

        # Snapshot scores for determinism logging
        score_snapshot: dict[str, tuple[int | None, dict]] = {}

        for geo_id in geography_ids:
            dimensions_out: dict[str, int | None] = {}
            sources_used: list[dict[str, Any]] = []
            years_used: list[int] = []
            indicators_present = 0
            used_proxy = False

            for dim_key in BASE_DIMENSION_KEYS:
                dim_cfg = DIMENSIONS[dim_key]
                parts: list[tuple[float, float]] = []
                for idx, ind in enumerate(dim_cfg["indicators"]):
                    scores = indicator_scores[dim_key][idx]
                    years = indicator_years[dim_key][idx]
                    if geo_id not in scores:
                        continue
                    parts.append((scores[geo_id], float(ind["weight"])))
                    indicators_present += 1
                    years_used.append(years[geo_id])
                    sources_used.append(
                        {
                            "source": ind["source"],
                            "indicator": ind["code"],
                            "year": years[geo_id],
                        }
                    )
                    if ind.get("is_proxy"):
                        used_proxy = True

                dim_score = weighted_average(parts)
                dimensions_out[dim_key] = (
                    round_score(dim_score) if dim_score is not None else None
                )

            # Trajectory composite from trend_scores
            traj_raw = compute_trajectory_score(
                trend_rates.get(geo_id, {}),
                vertical_weights,
            )
            if traj_raw is not None:
                dimensions_out["trajectory"] = round_score(traj_raw)
                trajectory_present += 1
            else:
                dimensions_out["trajectory"] = None

            # Overall from available dimensions (up to 7)
            overall_parts: list[tuple[float, float]] = []
            for dim_key, score in dimensions_out.items():
                if score is None:
                    continue
                weight = float(vertical_weights.get(dim_key, 0.0))
                if weight <= 0:
                    continue
                overall_parts.append((float(score), weight))

            dimensions_scored = len(overall_parts)
            if dimensions_scored < MIN_DIMENSIONS_FOR_OVERALL:
                overall_score: int | None = None
                null_overall += 1
            else:
                overall_raw = weighted_average(overall_parts)
                overall_score = (
                    round_score(overall_raw) if overall_raw is not None else None
                )

            confidence = compute_confidence(
                dimensions_scored=dimensions_scored,
                indicators_present=indicators_present,
                indicators_total=total_configured_indicators,
                used_proxy=used_proxy,
            )
            confidence_counts[confidence] += 1

            data_freshness = None
            if years_used:
                oldest = min(years_used)
                data_freshness = datetime(oldest, 1, 1, tzinfo=timezone.utc)

            # Stable source ordering for determinism of JSONB content
            sources_used.sort(key=lambda s: (s["source"], s["indicator"], s["year"]))

            upsert_mvi_score(
                cursor,
                geography_id=geo_id,
                overall_score=overall_score,
                dimensions=dimensions_out,
                confidence=confidence,
                data_freshness=data_freshness,
                sources=sources_used,
            )
            score_snapshot[geo_id] = (overall_score, dict(dimensions_out))
            scored += 1

        logger.info(
            "Wrote %s mvi_scores rows (null_overall=%s trajectory=%s) confidence=%s",
            scored,
            null_overall,
            trajectory_present,
            dict(confidence_counts),
        )

        non_null_overalls = [
            s for s, _ in score_snapshot.values() if s is not None
        ]
        if non_null_overalls:
            logger.info(
                "Overall score range min=%s max=%s mean=%.1f",
                min(non_null_overalls),
                max(non_null_overalls),
                sum(non_null_overalls) / len(non_null_overalls),
            )


if __name__ == "__main__":
    configure_logging()
    try:
        compute_all()
        logger.info("compute_mvi completed successfully")
    except Exception:
        logger.exception("compute_mvi failed")
        sys.exit(1)
