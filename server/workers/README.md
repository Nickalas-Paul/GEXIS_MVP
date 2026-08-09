# GEXIS Data Workers

Phase 7.5 — institutional indicators, trend projections, and Layer 2 market signals for the Market Viability Index.

## Prerequisites

- Python 3.10+
- Packages: `pip install -r requirements.txt`
- `DATABASE_URL` in the repo-root `.env` (PostGIS-enabled Postgres)
- API on `http://localhost:3001` when running signal workers that call the notification hook (override with `GEXIS_API_URL` / `API_URL`)

## Workers

| Script | Purpose |
|--------|---------|
| `seed_geographies.py` | Country boundary polygons into PostGIS |
| `seed_50m_geographies.py` | Higher-resolution geography seed (optional) |
| `populate_region_labels.py` | Region labels on geographies |
| `ingest_world_bank.py` | WDI + WGI market / infra / governance series |
| `ingest_imf.py` | IMF WEO GDP PPP (+ nominal staging) |
| `ingest_heritage.py` | Heritage Economic Freedom Index |
| `ingest_tax.py` | Tax Foundation corporate tax rates |
| `ingest_tax_global.py` | Global effective tax burden (World Bank) |
| `ingest_education.py` | Global education / talent indicators |
| `ingest_ilo.py` | ILO labor-force series |
| `ingest_infrastructure.py` | Expanded infrastructure (broadband, power, air, etc.) |
| `ingest_cpi.py` | Transparency / Control of Corruption path |
| `ingest_oecd.py` | Legacy OECD-member tertiary proxy (**superseded** by education for scoring) |
| `ingest_predictions.py` | Polymarket → `market_signals` (+ notification hook) |
| `ingest_events.py` | GDELT / seed events → `market_signals` (+ notification hook) |
| `compute_trends.py` | OLS trends, 2yr/5yr projections, signal adjustments |
| `compute_mvi.py` | Batch MVI scoring (`mvi_scores`) |

## Run order

1. **Ingest workers** — any order among `ingest_*` / seed scripts.
2. **`compute_trends.py`** — builds `trend_scores` and applies active signal adjustments to projections.
3. **`compute_mvi.py`** — writes `mvi_scores` (including composite Trajectory).

Signal workers (`ingest_predictions.py`, `ingest_events.py`) may run on a separate cadence. After writing signals they call `POST /api/signals/process-notifications` via `notify_signals.py` so verified agents covering those geographies get `market_event` notifications. Notification failures are logged and do not fail ingestion.

## Configuration

- DB: `config.py` / root `.env` (`DATABASE_URL`)
- Weights & indicators: `scoring_config.py`
- Product methodology: `sources/MVI_METHODOLOGY.md`
- Source catalog: `sources/DATA_SOURCES.md`
