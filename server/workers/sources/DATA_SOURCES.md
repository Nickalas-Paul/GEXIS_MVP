# GEXIS Data Source Catalog
## Phase 7.5 — Institutional + Layer 2 sources

Canonical MVI field name: **`dimensions`** (not `dimension_scores`). Keys match `MVIScore.dimensions` in `@gexis/gexis-core`.

Status values use the Source Status Key at the bottom of this document.

### Geography Boundaries
| Source | URL | Format | Coverage | License | Status | Notes |
|--------|-----|--------|----------|---------|--------|-------|
| Natural Earth 1:110m Admin-0 Countries | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson | GeoJSON | ~177 admin units | Public domain | **Active** | Used by `seed_geographies.py`. |
| Natural Earth 1:50m Admin-1 States/Provinces | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson | GeoJSON | Subnational | Public domain | **Active** | Optional higher-res seed (`seed_50m_geographies.py`). |

### MVI Dimension: Market Size & Growth (`dimensions.marketSizeAndGrowth`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| World Bank Open Data (WDI) | `https://api.worldbank.org/v2/country/all/indicator/{CODE}?format=json&date=2015:2024` | `NY.GDP.MKTP.CD`, `NY.GDP.MKTP.KD.ZG`, `SP.POP.TOTL` | JSON | Annual | **Active** — worker: `ingest_world_bank.py` |
| IMF World Economic Outlook (WEO) | SDMX / bulk Excel via data.imf.org | `imf_gdp_ppp` (scored); `imf_gdp_nominal` (ingested, **not scored**) | CSV/Excel | Biannual | **Active** — worker: `ingest_imf.py` |

### MVI Dimension: Talent Density (`dimensions.talentDensity`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| Education / UNESCO via WDI | World Bank Indicators API `date=2010:2024` | `SE.TER.CUAT.BA.ZS`, `SE.TER.ENRR`, `SL.TLF.ADVN.ZS`, `SE.XPD.TOTL.GD.ZS` | JSON | Annual | **Active** — worker: `ingest_education.py` (~196 countries) |
| ILO via WDI | World Bank Indicators API | `SL.TLF.CACT.ZS`, `SL.UEM.TOTL.ZS` | JSON | Annual | **Active** — worker: `ingest_ilo.py` (~181 countries) |
| OECD / WB education proxy | Legacy OECD-member tertiary series | `oecd_tertiary_attainment` | JSON | Annual | **Superseded** — worker `ingest_oecd.py` remains for historical rows; scoring uses `education` + `ilo`. STEM share (`oecd_stem_share`) is no longer inserted (source unreliable). |

### MVI Dimension: Tax Environment (`dimensions.taxEnvironment`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| Tax Foundation ITCI | GitHub CSV / taxfoundation.org | `corp_tax_rate` | CSV | Annual | **Active** — worker: `ingest_tax.py` (~38 countries) |
| Tax global (World Bank) | WDI `date=2010:2024` | `GC.TAX.TOTL.GD.ZS`, `GC.TAX.GSRV.RV.ZS` | JSON | Annual | **Active** — worker: `ingest_tax_global.py` (expands coverage to ~155) |

### MVI Dimension: Regulatory Ease (`dimensions.regulatoryEase`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| World Bank WGI | Sources API / Indicators API | `RQ.PER.RNK`, `GE.PER.RNK`, `RL.PER.RNK` | JSON | Annual | **Active** — `ingest_world_bank.py` (`--wgi-only` path) |
| Transparency / WGI Control of Corruption | WGI CC series | `CC.PER.RNK` (source tag `transparency`) | JSON | Annual | **Active** — worker: `ingest_cpi.py` |
| Heritage Foundation Index of Economic Freedom | Download hub / Excel | `heritage_overall`, business/trade/investment freedom (2022–2023 vintage) | XLS/CSV | Annual | **Active** — worker: `ingest_heritage.py` (~175). `heritage_financial_freedom` ingested but **not scored**. |
| World Bank Doing Business | Historical archive | Ease of Doing Business | Archive | Frozen ~2020 | **Archive** — not used in current scoring |

### MVI Dimension: Infrastructure (`dimensions.infrastructure`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| World Bank — Internet / LPI | WDI | `IT.NET.USER.ZS`, `LP.LPI.OVRL.XQ` | JSON | Annual / periodic | **Active** — `ingest_world_bank.py` |
| Infrastructure expanded (ITU–WDI) | WDI `date=2010:2024` | `EG.ELC.ACCS.ZS`, `IT.NET.BBND.P2`, `IT.CEL.SETS.P2`, `IS.AIR.DPRT` | JSON | Annual | **Active** — worker: `ingest_infrastructure.py` (source tag `infrastructure_expanded`) |

### MVI Dimension: Competitor Saturation (`dimensions.competitorSaturation`)
| Source | URL/API | Indicators | Format | Refresh | Status |
|--------|---------|------------|--------|---------|--------|
| World Bank — New business density | WDI | `IC.BUS.NDNS.ZS` | JSON | Annual | **Active** — `ingest_world_bank.py` |

### MVI Dimension: Trajectory (`dimensions.trajectory`)
Composite — no external raw indicators. Derived in `compute_mvi.py` from `trend_scores` produced by `compute_trends.py`.

### Layer 2: Market signals
| Source | URL/API | Worker | Status | Notes |
|--------|---------|--------|--------|-------|
| Polymarket Gamma API | prediction markets | `ingest_predictions.py` | **Active (live)** | Writes `market_signals`; calls notification hook |
| GDELT DOC 2.0 | news events | `ingest_events.py` | **Active (live / seed fallback)** | Rate limits may fall back to `gdelt_seed` rows |

Signals adjust 2yr/5yr projections in `compute_trends.py`; they do not replace base dimension scores.

### Source Status Key
- **Active** — API or download accessible; used in current pipeline
- **Superseded** — Still runnable for legacy rows; not primary for scoring
- **Archive** — Frozen; do not treat as current
- **Manual** — Requires download, HTML scrape, or interactive portal export

### Notes
1. Prefer World Bank WDI + IMF WEO for market-size inputs.
2. Talent Density scoring is global education + ILO — not the OECD-only proxy.
3. Tax Foundation ITCI remains OECD-focused; `tax_global` fills effective-burden coverage worldwide.
4. Competitor saturation at country level remains a formation-density proxy, not industry HHI.
5. After signal ingest, workers POST `/api/signals/process-notifications` so verified agents covering those geographies receive `market_event` notifications.
