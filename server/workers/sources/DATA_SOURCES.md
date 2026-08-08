# GEXIS Data Source Catalog
## Phase 3 — Initial Sources

Canonical MVI field name: **`dimensions`** (not `dimension_scores`). Keys match `MVIScore.dimensions` in `@gexis/gexis-core`.

Status values below use the Source Status Key at the bottom of this document.
URLs were HTTP-checked during Phase 3 Step 1 (2026-08-07) unless noted.

### Geography Boundaries
| Source | URL | Format | Coverage | License | Status | Notes |
|--------|-----|--------|----------|---------|--------|-------|
| Natural Earth 1:110m Admin-0 Countries | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson | GeoJSON | ~177 admin units | Public domain | **Active** | Used by `seed_geographies.py`. Properties: `ADMIN`/`NAME`, `ISO_A3`, `POP_EST`, `GDP_MD` (market GDP in millions USD — not PPP). Site: https://www.naturalearthdata.com/ |
| Natural Earth 1:50m Admin-1 States/Provinces | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson | GeoJSON | Subnational | Public domain | **Active** | Deferred to later Phase 3 step (state/metro seed). |

### MVI Dimension: Market Size & Growth (`dimensions.marketSizeAndGrowth`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| World Bank Open Data (WDI) | `https://api.worldbank.org/v2/country/{ISO2}/indicator/{CODE}?format=json&date=2015:2024` | `NY.GDP.MKTP.CD` GDP current US$; `NY.GDP.MKTP.KD.ZG` real GDP growth; `SP.POP.TOTL` population; `NY.GDP.PCAP.PP.CD` GDP/capita PPP | JSON | Annual | High | **Active** (verified 200) |
| World Bank bulk / docs | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392 | Same indicator codes | Docs | — | — | **Active** |
| IMF World Economic Outlook (WEO) | Portal: https://data.imf.org/en/datasets/IMF.RES:WEO — SDMX API pattern: `https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/{key}` with `Accept: text/csv` | `NGDPD` GDP USD; `PPPGDP` GDP PPP; `NGDP_RPCH` real growth; projections | CSV via SDMX / Excel bulk | Biannual (Apr/Oct) | High | **Active** — prefer portal bulk Excel if SDMX key construction is brittle |

### MVI Dimension: Talent Density (`dimensions.talentDensity`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| World Bank Education (WDI) | `https://api.worldbank.org/v2/country/USA/indicator/SE.TER.ENRR?format=json&date=2015:2024` | `SE.TER.ENRR` tertiary enrollment (% gross) | JSON | Annual | High | **Active** (verified 200) |
| OECD Data Explorer / SDMX | https://data-explorer.oecd.org/ — API host `https://sdmx.oecd.org/public/rest/data/...` | STEM graduates, tertiary attainment (dataset IDs selected per Explorer “Developer API” link) | CSV/JSON (SDMX) | Annual | High | **Active** portal; construct exact dataflow URLs from Explorer (generic dataflow list probes can 404) |
| UNESCO UIS | https://uis.unesco.org/ / API docs via UIS | Graduates by field (STEM share) | CSV/API | Annual | Medium–High | **Manual**/API — use when OECD coverage gaps |

### MVI Dimension: Tax Environment (`dimensions.taxEnvironment`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| KPMG Corporate Tax Rates Table | https://kpmg.com/xx/en/home/services/tax/tax-tools-and-resources/tax-rates-online/corporate-tax-rates-table.html | Statutory corporate income tax rates by country | HTML | Annual | High | **Manual** (verified 200) — scrape or curated mirror; no stable JSON API |
| Tax Foundation International Tax Competitiveness Index | https://raw.githubusercontent.com/TaxFoundation/international-tax-competitiveness-index/master/final_data/final_index_data_2025.csv — report: https://taxfoundation.org/research/all/global/2025-international-tax-competitiveness-index/ | ITCI overall + category scores (OECD countries) | CSV (GitHub) | Annual | Medium | **Active** (repo verified; OECD-only coverage → medium confidence outside OECD) |

### MVI Dimension: Regulatory Ease (`dimensions.regulatoryEase`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| World Bank Worldwide Governance Indicators (WGI) | Indicators API via WGI source id=3: `https://api.worldbank.org/v2/sources/3/country/all/indicator/{CODE}?format=json&date=2000:2024` — docs: https://www.worldbank.org/en/publication/worldwide-governance-indicators | Live fetch codes `GOV_WGI_RQ.SC`, `GOV_WGI_GE.SC`, `GOV_WGI_RL.SC` (0–100 governance scores). Stored under canonical keys `RQ.PER.RNK` (Regulatory Quality), `GE.PER.RNK` (Government Effectiveness), `RL.PER.RNK` (Rule of Law). Legacy `*.PER.RNK` percentile series were archived from the public Indicators API. | JSON | Annual | High | **Active** — used by `ingest_world_bank.py` (`--wgi-only`); primary Regulatory Ease inputs alongside Heritage |
| Heritage Foundation Index of Economic Freedom | Download hub: https://indexdotnet.azurewebsites.net/index/download — product site: https://economicfreedom.heritage.org/ | Overall EFI + component scores (business freedom, property rights, etc.) | XLS/CSV via download page | Annual | High | **Manual** (download hub verified 200; heritage.org/index/download returned 403) |
| World Bank Doing Business | Historical archive only (project discontinued 2021) | Ease of Doing Business rank/score | Archive | Frozen ~2020 | Medium (legacy) | **Archive** — do not treat as current; apply freshness penalty if used |
| World Bank Business Ready (B-READY) | https://www.worldbank.org/en/businessready | Successor regulatory/business climate metrics | Reports / forthcoming datasets | Rolling | High (when series mature) | **Active** site (verified 200) — preferred replacement for Doing Business once country coverage is sufficient for MVI |

### MVI Dimension: Infrastructure (`dimensions.infrastructure`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| World Bank — Internet use | `https://api.worldbank.org/v2/country/{ISO}/indicator/IT.NET.USER.ZS?format=json&date=2015:2024` | Individuals using the Internet (% of population) | JSON | Annual | High | **Active** (verified 200) |
| World Bank — Logistics Performance Index | `https://api.worldbank.org/v2/country/{ISO}/indicator/LP.LPI.OVRL.XQ?format=json&date=2015:2024` | LPI overall (1–5) | JSON | Periodic (~2–3 yrs) | High | **Active** (verified 200) |
| ITU DataHub | https://datahub.itu.int/ | Fixed broadband, mobile subscriptions, ICT access | Portal/CSV | Annual | High | **Manual**/portal — supplement where WDI gaps |

### MVI Dimension: Competitor Saturation (`dimensions.competitorSaturation`)
| Source | URL/API | Indicators | Format | Refresh | Confidence Impact | Status |
|--------|---------|------------|--------|---------|-------------------|--------|
| World Bank — New business density | `https://api.worldbank.org/v2/country/{ISO}/indicator/IC.BUS.NDNS.ZS?format=json&date=2015:2024` | New business registrations per 1,000 working-age people | JSON | Annual | Medium | **Active** (verified 200) — proxy for market entry intensity, not industry HHI |
| World Bank Enterprise Surveys | https://www.enterprisesurveys.org/ | Firm competition / informality / market structure proxies | Microdata/portal | Irregular | Medium | **Manual** — industry-vertical saturation needs specialized commercial databases later |

### Source Status Key
- **Active** — API or download accessible; data current enough for MVI ingestion
- **Archive** — Data frozen; usable only with an explicit date caveat and confidence penalty
- **Manual** — Requires download, HTML scrape, or interactive portal export (not a clean public JSON API)

### Notes for methodology page
1. Prefer World Bank WDI + IMF WEO for market-size inputs; they are machine-readable and globally comparable.
2. Doing Business is discontinued; cite B-READY as the forward-looking regulatory source and demote any frozen DB scores.
3. Tax Foundation ITCI covers OECD economies only — non-OECD tax scores should fall back to KPMG statutory rates with lower confidence.
4. Competitor saturation at country level is inherently weak without industry filters; flag low confidence until vertical-specific sources are added.
