# GEXIS Data Workers

Phase 3 - Data ingestion pipeline for the Market Viability Index.

## Setup
pip install -r requirements.txt

## Workers
- `seed_geographies.py` - Load country boundary polygons into PostGIS
- `ingest_world_bank.py` - Market size, infrastructure, competitor proxies (WDI)
- `ingest_imf.py` - GDP nominal / PPP (IMF WEO SDMX)
- `ingest_heritage.py` - Economic Freedom Index (regulatory ease)
- `ingest_tax.py` - Corporate tax rates (Tax Foundation)
- `ingest_oecd.py` - Talent density (OECD members; WB education proxy)
- `compute_mvi.py` - Batch MVI scoring engine (writes `mvi_scores`)

## Configuration
Workers read DATABASE_URL from the root .env file.
Scoring weights and indicator maps live in `scoring_config.py`.
Methodology (product-facing): `sources/MVI_METHODOLOGY.md`.