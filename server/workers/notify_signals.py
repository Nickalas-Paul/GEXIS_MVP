"""
Trigger API notification processing after market_signals ingestion.

Workers stay Python; notification creation lives in the Node API.
Failures here must never fail the ingest pipeline.
"""

from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

DEFAULT_API_BASE = "http://localhost:3001"


def trigger_signal_notifications(timeout: float = 30.0) -> None:
    """
    POST /api/signals/process-notifications on the local API.

    Uses GEXIS_API_URL or API_URL when set; otherwise http://localhost:3001.
    """
    base = (
        os.getenv("GEXIS_API_URL")
        or os.getenv("API_URL")
        or DEFAULT_API_BASE
    ).rstrip("/")
    url = f"{base}/api/signals/process-notifications"
    try:
        response = requests.post(url, timeout=timeout)
        if response.ok:
            logger.info(
                "Signal notifications processed: %s %s",
                response.status_code,
                response.text[:300],
            )
        else:
            logger.warning(
                "Signal notifications endpoint returned %s: %s",
                response.status_code,
                response.text[:300],
            )
    except Exception:
        logger.exception(
            "Failed to call signal notifications endpoint at %s "
            "(ingestion continues)",
            url,
        )
