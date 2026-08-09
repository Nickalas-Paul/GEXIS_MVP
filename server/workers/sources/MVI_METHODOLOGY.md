# Market Viability Index (MVI) Methodology

*Last updated: Phase 7.5 — data engine hardening (scoring + Layer 2 signals)*

This document describes how GEXIS calculates the Market Viability Index. It is written for product users and feeds the public methodology page (`/docs/methodology`).

## What the MVI measures

The Market Viability Index is a **0–100** score that summarizes how attractive a geography is for market entry. Higher scores mean stronger overall viability on the dimensions we track today.

**Seven dimensions** contribute to the overall score:

| Dimension key | Label | What it captures |
|---|---|---|
| `marketSizeAndGrowth` | Market Size & Growth | Economic scale, growth, and population |
| `talentDensity` | Talent Density | Education attainment, tertiary enrollment, skilled labor force |
| `taxEnvironment` | Tax Environment | Statutory corporate tax and effective tax burden |
| `regulatoryEase` | Regulatory Ease | Governance quality, corruption control, and economic freedom |
| `infrastructure` | Infrastructure | Digital access, electricity, logistics, and air transport |
| `competitorSaturation` | Competitor Saturation | Intensity of new business formation (market activity proxy) |
| `trajectory` | Trajectory | **Composite** momentum from trend direction/rate across the other six dimensions |

Each base dimension is scored **0–100**. Missing dimensions are stored as `null` (not zero). Zero means “measured and weak,” not “no data.” Trajectory is derived after base dimensions and trends are computed — it has no raw indicators of its own.

## How each dimension is calculated

For every indicator in a base dimension:

1. Take the **most recent non-null** value per country from `raw_indicators`.
2. Normalize across all countries that have that indicator:
   - **Linear:** min–max scale to 0–100.
   - **Log scale:** apply `log10` first (for GDP, population, air departures), then min–max.
3. If the indicator is **lower-is-better** (tax rates, unemployment), invert: `100 − normalized`.
4. Combine available indicators with configured weights. If a country is missing some indicators, weights are **redistributed** among the indicators that do have data — we never invent zeros.

### Market Size & Growth

| Indicator | Source | Normalization | Direction | Weight |
|---|---|---|---|---|
| GDP (current US$) | World Bank WDI | Log | Higher better | 0.35 |
| GDP growth (annual %) | World Bank WDI | Linear | Higher better | 0.35 |
| Population | World Bank WDI | Log | Higher better | 0.15 |
| GDP PPP | IMF WEO | Log | Higher better | 0.15 |

`imf_gdp_nominal` is ingested for staging but **not scored** — World Bank `NY.GDP.MKTP.CD` covers the same concept with better coverage.

### Talent Density

Six indicators from education and ILO sources covering ~196 countries. This is **not** a proxy dimension.

| Indicator | Source | Weight | Direction |
|---|---|---|---|
| Bachelor+ attainment (% 25+) | Education / UNESCO–WDI | 0.25 | Higher better |
| Tertiary enrollment (% gross) | Education | 0.20 | Higher better |
| Labor force with advanced education | Education | 0.20 | Higher better |
| Labor force participation rate | ILO | 0.15 | Higher better |
| Unemployment rate | ILO | 0.10 | Lower better |
| Government education expenditure (% GDP) | Education | 0.10 | Higher better |

The legacy `oecd` source (OECD-member tertiary proxy) is superseded for scoring by these global series.

### Tax Environment

Three indicators covering ~155 countries:

| Indicator | Source | Weight | Direction |
|---|---|---|---|
| Statutory corporate tax rate | Tax Foundation ITCI | 0.40 | Lower better |
| Tax revenue (% of GDP) | Tax global (World Bank) | 0.35 | Lower better |
| Taxes on goods and services (% of revenue) | Tax global (World Bank) | 0.25 | Lower better |

### Regulatory Ease

WGI carries **0.52** combined weight; Heritage carries **0.33**. Transparency International / Control of Corruption is included via the WGI Control of Corruption series (source tag `transparency`).

| Indicator | Source | Weight |
|---|---|---|
| Regulatory Quality (WGI) | World Bank WGI | 0.25 |
| Control of Corruption (WGI) | Transparency / WGI CC | 0.15 |
| Government Effectiveness (WGI) | World Bank WGI | 0.15 |
| Economic Freedom Index (overall) | Heritage Foundation | 0.13 |
| Rule of Law (WGI) | World Bank WGI | 0.12 |
| Business Freedom | Heritage | 0.10 |
| Trade Freedom | Heritage | 0.05 |
| Investment Freedom | Heritage | 0.05 |

`heritage_financial_freedom` is ingested but **not scored** (overlaps WGI Government Effectiveness).

### Infrastructure

Six indicators (broadband, mobile, electricity, air transport, plus internet users and LPI):

| Indicator | Source | Weight |
|---|---|---|
| Access to electricity | Infrastructure expanded | 0.20 |
| Fixed broadband subscriptions (per 100) | Infrastructure expanded | 0.20 |
| Logistics Performance Index | World Bank | 0.20 |
| Internet users (% of population) | World Bank | 0.15 |
| Mobile cellular subscriptions (per 100) | Infrastructure expanded | 0.15 |
| Air transport departures | Infrastructure expanded | 0.10 |

### Competitor Saturation

| Indicator | Source | Notes |
|---|---|---|
| New business density (per 1,000) | World Bank | Higher formation rates score higher as a market-activity / saturation proxy — not industry HHI |

### Trajectory (composite)

Trajectory is computed from `trend_scores` after the six base dimensions are scored. It summarizes trend direction and annualized rate across base dimensions into a 0–100 momentum score. It does not replace any base dimension; it is an additional input to the overall MVI (and is re-weighted per industry vertical).

## How the overall score is computed

For the default vertical `all` / `all_industries`, the seven dimensions (six base + trajectory) are combined with near-equal base weights and trajectory at 1.0× the average base weight.

1. Keep only dimensions with a real score.
2. Redistribute weights among available dimensions.
3. Overall = weighted average, rounded to the nearest integer (0–100).
4. If fewer than **three** dimensions have scores → overall is `null` (insufficient data).

### Industry verticals

**Active.** Eleven verticals apply different weight profiles at query time (API / explorer filters). Examples:

- **Technology & SaaS / Telecommunications:** trajectory weighted **1.3×**
- **Manufacturing / Energy & Renewables:** trajectory weighted **0.7×**
- Other verticals (financial, healthcare, ecommerce, professional, logistics, consumer goods, all): trajectory **1.0×**

Base dimension emphasis also shifts (e.g. talent-heavy for tech/professional, infrastructure-heavy for logistics).

## Confidence levels

Every score carries a confidence flag: `high`, `medium`, or `low`.

| Level | Rule |
|---|---|
| **High** | ≥6 dimensions scored **and** ≥60% of configured indicators present |
| **Medium** | ≥4 dimensions scored **or** ≥30% indicator coverage |
| **Low** | Below those thresholds |

There is **no proxy confidence cap**. Proxy language for Talent Density was removed once global education/ILO coverage landed.

## Market signals (Layer 2)

Real-time **market signals** from prediction markets (Polymarket) and news events (GDELT) inform **2-year and 5-year projections**. They do **not** replace base dimension scores or the current MVI overall.

At a high level:

1. Each active signal has a direction (`positive` / `negative` / `neutral`), optional probability, severity (1–5), and affected dimension keys.
2. Adjustment magnitude ≈ **probability × severity** (or severity-only when probability is missing), age-decayed, and **hard-capped per signal** (max ~8 score points).
3. Multiple signals on the same dimension stack with **diminishing returns** (`1/√n` scaling) and a final hard cap on the net shift.
4. Neutral signals widen confidence intervals without shifting the point estimate.
5. `annualized_rate` and historical trend fits are never rewritten by signals — only projected endpoints (and 2yr CI width) move.

Signals surface in the explorer UI (drill-down, geography detail, top-matches dots) and can notify verified agents covering the affected geography.

## Data freshness

`data_freshness` is the **oldest calendar year** among indicators that actually contributed to a country’s score, stored as January 1 of that year (UTC).

This reflects source vintage, not the date GEXIS last ran the workers. Re-running ingestion or scoring updates `calculated_at`; freshness only moves when newer source years enter the inputs.

## Missing data behavior

- We **do not** fill missing indicators with zero.
- Weights redistribute among available inputs.
- Dimensions with no inputs stay `null`.
- Overall stays `null` until at least three dimensions score.
- Confidence falls as coverage falls.

## Current source coverage (approximate)

| Source | Role | Countries (approx.) |
|---|---|---|
| World Bank WDI | GDP, growth, population, internet, LPI, business density, WGI governance | ~197 |
| World Bank WGI | Regulatory Quality, Government Effectiveness, Rule of Law | ~197 |
| IMF WEO | GDP PPP (nominal also ingested, not scored) | ~192 |
| Heritage Foundation | Economic freedom components (2022–2023 vintage) | ~175 |
| Tax Foundation | Statutory corporate tax rates | ~38 |
| Education / UNESCO (WDI) | Tertiary attainment, enrollment, advanced education, education spend | ~196 |
| ILO | Labor force participation, unemployment | ~181 |
| Infrastructure / ITU–WDI | Broadband, mobile, electricity, air transport | ~197 |
| Transparency International / WGI CC | Control of Corruption | ~197 |
| Polymarket | Live prediction-market signals | Live |
| GDELT | Live / seeded news-event signals | Live |

## Update frequency

Workers and the scoring engine are batch tools. Typical order:

```text
# Ingest (any order among ingest_* scripts)
python ingest_world_bank.py
python ingest_imf.py
python ingest_heritage.py
python ingest_tax.py
python ingest_tax_global.py
python ingest_education.py
python ingest_ilo.py
python ingest_infrastructure.py   # or infrastructure_expanded worker
python ingest_cpi.py              # transparency / CPI path
python ingest_predictions.py      # also calls notification hook
python ingest_events.py           # also calls notification hook

# Score
python compute_trends.py
python compute_mvi.py
```

Re-running the engine with the same `raw_indicators` produces the **same** base scores (deterministic). Projection endpoints can change when active `market_signals` change.

## Design principles

1. **Transparent** — every score can be traced to `(source, indicator, year)` tuples in `mvi_scores.sources`.
2. **Honest about gaps** — nulls and confidence flags beat false precision.
3. **Configurable** — indicator maps and weights live in `scoring_config.py`; the engine does not hardcode them.
4. **Canonical naming** — dimension keys match the TypeScript `MVIScore.dimensions` contract (`dimensions`, never `dimension_scores`).
5. **Signals as overlays** — Layer 2 events adjust forward views; they do not rewrite institutional dimension scores.
