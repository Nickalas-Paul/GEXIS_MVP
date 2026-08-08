"""
Trend computation engine.

Reads historical raw_indicators, builds per-dimension 0–100 score series
(using the same normalization + weight redistribution as compute_mvi), fits
linear trends, and upserts projections into trend_scores.

Usage:
    python compute_trends.py
"""

from __future__ import annotations

import logging
import math
import sys
from collections import defaultdict
from typing import Any

import numpy as np
from scipy import stats

from config import LOGS_DIR
from db import get_cursor
from scoring_config import BASE_DIMENSION_KEYS, DIMENSIONS

# Direction thresholds (points/year on the 0–100 scale)
RATE_STABLE_BAND = 0.5
# 90% two-sided normal quantile
Z_90 = 1.6448536269514722
EPS = 1e-4

# Domain-aware regression transforms for projections
LOG_SCORE_DIMS = {"marketSizeAndGrowth"}
LOGIT_SCORE_DIMS = {"regulatoryEase"}


def configure_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOGS_DIR / "compute_trends.log", encoding="utf-8"),
        ],
    )


logger = logging.getLogger("compute_trends")


def clamp_score(value: float) -> float:
    return float(min(100.0, max(0.0, value)))


def round4(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 4)


def transform_for_norm(value: float, normalization: str) -> float | None:
    if normalization == "log_scale":
        if value <= 0:
            return None
        return math.log10(value)
    return value


def min_max_normalize_values(
    transformed: list[float],
    direction: str,
) -> list[float]:
    """Normalize a flat list of transformed values to 0–100 (direction-aware)."""
    if not transformed:
        return []
    vmin = min(transformed)
    vmax = max(transformed)
    out: list[float] = []
    for value in transformed:
        if vmax == vmin:
            score = 50.0
        else:
            score = (value - vmin) / (vmax - vmin) * 100.0
        if direction == "lower_is_better":
            score = 100.0 - score
        out.append(score)
    return out


def weighted_average(parts: list[tuple[float, float]]) -> float | None:
    if not parts:
        return None
    total_weight = sum(w for _, w in parts)
    if total_weight <= 0:
        return None
    return sum(score * (weight / total_weight) for score, weight in parts)


def to_log_score(score: float) -> float:
    return math.log(max(score, 0.1))


def from_log_score(z: float) -> float:
    return math.exp(z)


def to_logit_score(score: float) -> float:
    p = min(1.0 - EPS, max(EPS, score / 100.0))
    return math.log(p / (1.0 - p))


def from_logit_score(z: float) -> float:
    # Numerically stable sigmoid
    if z >= 0:
        ez = math.exp(-z)
        p = 1.0 / (1.0 + ez)
    else:
        ez = math.exp(z)
        p = ez / (1.0 + ez)
    return p * 100.0


def transform_series(
    years: np.ndarray,
    scores: np.ndarray,
    dim_key: str,
) -> tuple[np.ndarray, Any, Any]:
    """Return (y_transformed, forward_fn, inverse_fn) for projection space."""
    if dim_key in LOG_SCORE_DIMS:
        return (
            np.array([to_log_score(float(s)) for s in scores], dtype=float),
            to_log_score,
            from_log_score,
        )
    if dim_key in LOGIT_SCORE_DIMS:
        return (
            np.array([to_logit_score(float(s)) for s in scores], dtype=float),
            to_logit_score,
            from_logit_score,
        )
    identity = lambda x: float(x)
    return scores.astype(float), identity, identity


def trend_confidence_for_n(n: int) -> str:
    if n >= 8:
        return "high"
    if n >= 5:
        return "medium"
    return "low"


def direction_from_rate(rate: float) -> str:
    if rate > RATE_STABLE_BAND:
        return "improving"
    if rate < -RATE_STABLE_BAND:
        return "declining"
    return "stable"


def linear_fit(years: np.ndarray, values: np.ndarray) -> tuple[float, float, float]:
    """
    Returns (slope, intercept, residual_std).
    residual_std is sample std of residuals (ddof=2 when n>2, else 0).
    """
    result = stats.linregress(years, values)
    slope = float(result.slope)
    intercept = float(result.intercept)
    fitted = intercept + slope * years
    resid = values - fitted
    n = len(values)
    if n > 2:
        residual_std = float(np.sqrt(np.sum(resid**2) / (n - 2)))
    else:
        residual_std = 0.0
    return slope, intercept, residual_std


def prediction_interval(
    years: np.ndarray,
    residual_std: float,
    intercept: float,
    slope: float,
    target_year: float,
    horizon: int,
) -> tuple[float, float, float]:
    """
    Point estimate + 90% interval at target_year.
    Widens residual SE proportionally to horizon length (vs 2yr baseline).
    """
    n = len(years)
    y_hat = intercept + slope * target_year
    if n < 3 or residual_std <= 0:
        return y_hat, y_hat, y_hat

    x_bar = float(np.mean(years))
    sxx = float(np.sum((years - x_bar) ** 2))
    if sxx <= 0:
        se = residual_std
    else:
        se = residual_std * math.sqrt(1.0 / n + (target_year - x_bar) ** 2 / sxx)

    # Proportional widen: 2yr = 1.0x, 5yr = 2.5x relative to 2yr baseline
    widen = max(horizon, 1) / 2.0
    half = Z_90 * se * widen
    return y_hat, y_hat - half, y_hat + half


def fit_trend(
    dim_key: str,
    series: list[tuple[int, float]],
) -> dict[str, Any] | None:
    """Fit trend for one geography×dimension series of (year, score)."""
    if not series:
        return None

    series = sorted(series, key=lambda p: p[0])
    years = np.array([y for y, _ in series], dtype=float)
    scores = np.array([s for _, s in series], dtype=float)
    n = len(series)
    current_score = float(scores[-1])
    latest_year = int(years[-1])
    earliest_year = int(years[0])

    # Sparse series: stable placeholder projections
    if n < 3:
        return {
            "direction": "stable",
            "annualized_rate": 0.0,
            "acceleration": None,
            "current_score": current_score,
            "projected_2yr": current_score,
            "projected_5yr": current_score,
            "confidence_lower_2yr": current_score,
            "confidence_upper_2yr": current_score,
            "confidence_lower_5yr": current_score,
            "confidence_upper_5yr": current_score,
            "trend_confidence": "low",
            "data_points": n,
            "year_range_start": earliest_year,
            "year_range_end": latest_year,
        }

    # Rate / direction / acceleration always on the 0–100 score scale
    slope_score, intercept_score, resid_std_score = linear_fit(years, scores)
    annualized_rate = slope_score
    direction = direction_from_rate(annualized_rate)

    acceleration: float | None = None
    if n >= 6:
        recent = series[-5:]
        ry = np.array([y for y, _ in recent], dtype=float)
        rs = np.array([s for _, s in recent], dtype=float)
        slope_recent, _, _ = linear_fit(ry, rs)
        acceleration = slope_recent - slope_score

    # Projections in domain-aware transform space
    y_t, _fwd, inv = transform_series(years, scores, dim_key)
    slope_t, intercept_t, resid_std_t = linear_fit(years, y_t)

    def project(horizon: int) -> tuple[float, float, float]:
        target = float(latest_year + horizon)
        y_hat_t, lo_t, hi_t = prediction_interval(
            years, resid_std_t, intercept_t, slope_t, target, horizon
        )
        # Convert bounds via inverse; order may flip for decreasing transforms
        mid = clamp_score(inv(y_hat_t))
        lo = clamp_score(inv(lo_t))
        hi = clamp_score(inv(hi_t))
        if lo > hi:
            lo, hi = hi, lo
        return mid, lo, hi

    p2, lo2, hi2 = project(2)
    p5, lo5, hi5 = project(5)

    return {
        "direction": direction,
        "annualized_rate": annualized_rate,
        "acceleration": acceleration,
        "current_score": current_score,
        "projected_2yr": p2,
        "projected_5yr": p5,
        "confidence_lower_2yr": lo2,
        "confidence_upper_2yr": hi2,
        "confidence_lower_5yr": lo5,
        "confidence_upper_5yr": hi5,
        "trend_confidence": trend_confidence_for_n(n),
        "data_points": n,
        "year_range_start": earliest_year,
        "year_range_end": latest_year,
    }


def fetch_indicator_history(
    cursor,
    source: str,
    code: str,
) -> list[tuple[str, int, float]]:
    """All non-null (geography_id, year, value) rows for one indicator."""
    cursor.execute(
        """
        SELECT geography_id::text, year, value::float8
        FROM raw_indicators
        WHERE source = %s
          AND indicator_code = %s
          AND value IS NOT NULL
        ORDER BY year, geography_id
        """,
        (source, code),
    )
    return [(row[0], int(row[1]), float(row[2])) for row in cursor.fetchall()]


def normalize_indicator_panel(
    rows: list[tuple[str, int, float]],
    normalization: str,
    direction: str,
) -> dict[str, dict[int, float]]:
    """
    Global-panel min-max normalize (same transform + direction as compute_mvi).
    Returns {geography_id: {year: normalized_0_100}}.
    """
    if not rows:
        return {}

    transformed_vals: list[float] = []
    meta: list[tuple[str, int]] = []
    for geo_id, year, value in rows:
        tval = transform_for_norm(value, normalization)
        if tval is None:
            continue
        transformed_vals.append(tval)
        meta.append((geo_id, year))

    scores = min_max_normalize_values(transformed_vals, direction)
    out: dict[str, dict[int, float]] = defaultdict(dict)
    for (geo_id, year), score in zip(meta, scores):
        out[geo_id][year] = score
    return out


def build_dimension_series(
    dim_cfg: dict[str, Any],
    indicator_panels: list[dict[str, dict[int, float]]],
    geography_ids: list[str],
) -> dict[str, list[tuple[int, float]]]:
    """
    For each geography, one (year, dimension_score) series using weight
    redistribution among indicators available that year.
    """
    indicators = dim_cfg["indicators"]
    # Collect candidate years per geo from any indicator
    years_by_geo: dict[str, set[int]] = defaultdict(set)
    for panel in indicator_panels:
        for geo_id, year_map in panel.items():
            years_by_geo[geo_id].update(year_map.keys())

    series_by_geo: dict[str, list[tuple[int, float]]] = {}
    for geo_id in geography_ids:
        years = sorted(years_by_geo.get(geo_id, set()))
        points: list[tuple[int, float]] = []
        for year in years:
            parts: list[tuple[float, float]] = []
            for idx, ind in enumerate(indicators):
                score = indicator_panels[idx].get(geo_id, {}).get(year)
                if score is None:
                    continue
                parts.append((score, float(ind["weight"])))
            dim_score = weighted_average(parts)
            if dim_score is not None:
                points.append((year, float(dim_score)))
        if points:
            series_by_geo[geo_id] = points
    return series_by_geo


def upsert_trend(cursor, geography_id: str, dimension: str, row: dict[str, Any]) -> None:
    cursor.execute(
        """
        INSERT INTO trend_scores (
            geography_id,
            dimension,
            direction,
            annualized_rate,
            acceleration,
            current_score,
            projected_2yr,
            projected_5yr,
            confidence_lower_2yr,
            confidence_upper_2yr,
            confidence_lower_5yr,
            confidence_upper_5yr,
            trend_confidence,
            data_points,
            year_range_start,
            year_range_end,
            computed_at
        )
        VALUES (
            %(geography_id)s,
            %(dimension)s,
            %(direction)s,
            %(annualized_rate)s,
            %(acceleration)s,
            %(current_score)s,
            %(projected_2yr)s,
            %(projected_5yr)s,
            %(confidence_lower_2yr)s,
            %(confidence_upper_2yr)s,
            %(confidence_lower_5yr)s,
            %(confidence_upper_5yr)s,
            %(trend_confidence)s,
            %(data_points)s,
            %(year_range_start)s,
            %(year_range_end)s,
            NOW()
        )
        ON CONFLICT (geography_id, dimension)
        DO UPDATE SET
            direction = EXCLUDED.direction,
            annualized_rate = EXCLUDED.annualized_rate,
            acceleration = EXCLUDED.acceleration,
            current_score = EXCLUDED.current_score,
            projected_2yr = EXCLUDED.projected_2yr,
            projected_5yr = EXCLUDED.projected_5yr,
            confidence_lower_2yr = EXCLUDED.confidence_lower_2yr,
            confidence_upper_2yr = EXCLUDED.confidence_upper_2yr,
            confidence_lower_5yr = EXCLUDED.confidence_lower_5yr,
            confidence_upper_5yr = EXCLUDED.confidence_upper_5yr,
            trend_confidence = EXCLUDED.trend_confidence,
            data_points = EXCLUDED.data_points,
            year_range_start = EXCLUDED.year_range_start,
            year_range_end = EXCLUDED.year_range_end,
            computed_at = NOW()
        """,
        {
            "geography_id": geography_id,
            "dimension": dimension,
            "direction": row["direction"],
            "annualized_rate": round4(row["annualized_rate"]),
            "acceleration": round4(row["acceleration"]),
            "current_score": round4(row["current_score"]),
            "projected_2yr": round4(row["projected_2yr"]),
            "projected_5yr": round4(row["projected_5yr"]),
            "confidence_lower_2yr": round4(row["confidence_lower_2yr"]),
            "confidence_upper_2yr": round4(row["confidence_upper_2yr"]),
            "confidence_lower_5yr": round4(row["confidence_lower_5yr"]),
            "confidence_upper_5yr": round4(row["confidence_upper_5yr"]),
            "trend_confidence": row["trend_confidence"],
            "data_points": int(row["data_points"]),
            "year_range_start": row["year_range_start"],
            "year_range_end": row["year_range_end"],
        },
    )


def compute_all() -> None:
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
        logger.info("Computing trends for %s countries × %s dimensions",
                    len(geography_ids), len(BASE_DIMENSION_KEYS))

        written = 0
        direction_counts: dict[str, int] = defaultdict(int)
        confidence_counts: dict[str, int] = defaultdict(int)

        for dim_key in BASE_DIMENSION_KEYS:
            dim_cfg = DIMENSIONS[dim_key]
            indicator_panels: list[dict[str, dict[int, float]]] = []
            for ind in dim_cfg["indicators"]:
                rows = fetch_indicator_history(cursor, ind["source"], ind["code"])
                panel = normalize_indicator_panel(
                    rows, ind["normalization"], ind["direction"]
                )
                indicator_panels.append(panel)
                logger.info(
                    "Indicator %s/%s: %s raw rows -> %s geos with scores",
                    ind["source"],
                    ind["code"],
                    len(rows),
                    len(panel),
                )

            series_by_geo = build_dimension_series(
                dim_cfg, indicator_panels, geography_ids
            )
            logger.info(
                "Dimension %s: %s countries with a time series",
                dim_key,
                len(series_by_geo),
            )

            for geo_id, series in series_by_geo.items():
                result = fit_trend(dim_key, series)
                if result is None:
                    continue
                upsert_trend(cursor, geo_id, dim_key, result)
                written += 1
                direction_counts[result["direction"]] += 1
                confidence_counts[result["trend_confidence"]] += 1

        logger.info(
            "Wrote %s trend_scores rows directions=%s confidence=%s",
            written,
            dict(direction_counts),
            dict(confidence_counts),
        )


if __name__ == "__main__":
    configure_logging()
    try:
        compute_all()
        logger.info("compute_trends completed successfully")
    except Exception:
        logger.exception("compute_trends failed")
        sys.exit(1)
