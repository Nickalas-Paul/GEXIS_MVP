# Market Viability Index (MVI) Methodology

*Last updated: Phase 3 Step 3 — scoring engine v0.1.0*

This document describes how GEXIS calculates the Market Viability Index. It is written for product users and will feed the public methodology page.

## What the MVI measures

The Market Viability Index is a **0–100** score that summarizes how attractive a geography is for market entry. Higher scores mean stronger overall viability on the dimensions we track today.

Six dimensions contribute to the overall score:

| Dimension key | Label | What it captures |
|---|---|---|
| `marketSizeAndGrowth` | Market Size & Growth | Economic scale, growth, and population |
| `talentDensity` | Talent Density | Skilled / tertiary-educated workforce |
| `taxEnvironment` | Tax Environment | Corporate tax competitiveness |
| `regulatoryEase` | Regulatory Ease | Economic freedom and ease of doing business climate |
| `infrastructure` | Infrastructure | Digital access and logistics performance |
| `competitorSaturation` | Competitor Saturation | Intensity of new business formation (market activity proxy) |

Each dimension is scored **0–100**. Missing dimensions are stored as `null` (not zero). Zero means “measured and weak,” not “no data.”

## How each dimension is calculated

For every indicator in a dimension:

1. Take the **most recent non-null** value per country from `raw_indicators`.
2. Normalize across all countries that have that indicator:
   - **Linear:** min–max scale to 0–100.
   - **Log scale:** apply `log10` first (for GDP and population, which span orders of magnitude), then min–max.
3. If the indicator is **lower-is-better** (corporate tax rate), invert the score: `100 − normalized`.
4. Combine available indicators with configured weights. If a country is missing some indicators, weights are **redistributed** among the indicators that do have data — we never invent zeros.

### Market Size & Growth

| Indicator | Source | Normalization | Direction | Weight |
|---|---|---|---|---|
| GDP (current US$) | World Bank | Log | Higher better | 0.35 |
| GDP growth (annual %) | World Bank | Linear | Higher better | 0.35 |
| Population | World Bank | Log | Higher better | 0.15 |
| GDP PPP | IMF WEO | Log | Higher better | 0.15 |

### Talent Density

| Indicator | Source | Notes |
|---|---|---|
| Tertiary attainment proxy | Tagged `oecd` | Currently backed by World Bank bachelor+ attainment for OECD members only — treated as **proxy data** |

STEM graduate share is configured but not yet active (no non-null source data).

### Tax Environment

| Indicator | Source | Direction |
|---|---|---|
| Corporate tax rate (%) | Tax Foundation ITCI | **Lower is better** (lower statutory rate → higher dimension score) |

Coverage today is roughly OECD economies (~38 countries).

### Regulatory Ease

| Indicator | Source | Weight |
|---|---|---|
| Economic Freedom Index (overall) | Heritage Foundation | 0.40 |
| Business Freedom | Heritage | 0.30 |
| Trade Freedom | Heritage | 0.15 |
| Investment Freedom | Heritage | 0.15 |

Heritage vintage currently ingested: **2023**.

### Infrastructure

| Indicator | Source | Weight |
|---|---|---|
| Internet users (% of population) | World Bank | 0.50 |
| Logistics Performance Index | World Bank | 0.50 |

LPI updates infrequently; many year-cells are null. The engine uses the latest non-null observation.

### Competitor Saturation

| Indicator | Source | Notes |
|---|---|---|
| New business density (per 1,000) | World Bank | Higher formation rates score higher as a market-activity / saturation proxy — not industry HHI |

## How the overall score is computed

For the default vertical `all_industries`, the six dimensions are weighted **equally** (1/6 each).

1. Keep only dimensions with a real score.
2. Redistribute weights among available dimensions.
3. Overall = weighted average, rounded to the nearest integer (0–100).
4. If fewer than **three** dimensions have scores → overall is `null` (insufficient data).

Industry-specific weight overrides (for example SaaS-heavy talent weighting) are scaffolded for a later phase and are not active yet.

## Confidence levels

Every score carries a confidence flag: `high`, `medium`, or `low`.

| Level | Rule of thumb |
|---|---|
| **High** | 5–6 dimensions scored **and** ≥60% of configured indicators present |
| **Medium** | 3–4 dimensions scored **or** 30–59% indicator coverage |
| **Low** | 1–2 dimensions scored **or** <30% indicator coverage |

**Proxy penalty:** if any contributing dimension relies only on proxy data (today: Talent Density’s World Bank education proxy), confidence is **capped at medium** even when coverage would otherwise be high.

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

| Source | Role | Countries with data (approx.) |
|---|---|---|
| World Bank WDI | GDP, growth, population, internet, LPI, business density | ~169 |
| IMF WEO | GDP PPP (and nominal in staging) | ~163 |
| Heritage EFI | Regulatory / freedom components | ~165 |
| Tax Foundation ITCI | Corporate tax rates | ~38 (OECD-focused) |
| OECD / WB education proxy | Talent density tertiary proxy | ~38 |

Tiny economies absent from Natural Earth 1:110m boundaries (for example Singapore) are not in the geography table yet and therefore have no MVI row.

## Update frequency

Workers and the scoring engine are batch tools:

```text
python ingest_world_bank.py
python ingest_imf.py
python ingest_heritage.py
python ingest_tax.py
python ingest_oecd.py
python compute_mvi.py
```

Re-running the engine with the same `raw_indicators` produces the **same** scores (deterministic). Freshness labels track the underlying source years, not the platform clock.

## Design principles

1. **Transparent** — every score can be traced to `(source, indicator, year)` tuples in `mvi_scores.sources`.
2. **Honest about gaps** — nulls and confidence flags beat false precision.
3. **Configurable** — indicator maps and weights live in `scoring_config.py`; the engine does not hardcode them.
4. **Canonical naming** — dimension keys match the TypeScript `MVIScore.dimensions` contract (`dimensions`, never `dimension_scores`).
