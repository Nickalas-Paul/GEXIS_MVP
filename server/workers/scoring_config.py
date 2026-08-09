"""
MVI Scoring Configuration
========================
Edit this file to add/remove indicators, change weights, or adjust normalization.
The scoring engine reads this config — it does not hardcode indicator mappings.

Dimension keys match MVIScore.dimensions in packages/gexis-core/src/index.ts.
Source names must match raw_indicators.source values from the ingestion workers.
"""

DIMENSIONS = {
    "marketSizeAndGrowth": {
        "label": "Market Size & Growth",
        "indicators": [
            {
                "source": "world_bank",
                "code": "NY.GDP.MKTP.CD",
                "name": "GDP (current US$)",
                "weight": 0.35,
                "direction": "higher_is_better",
                "normalization": "log_scale",
            },
            {
                "source": "world_bank",
                "code": "NY.GDP.MKTP.KD.ZG",
                "name": "GDP growth (annual %)",
                "weight": 0.35,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "SP.POP.TOTL",
                "name": "Population",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "log_scale",
            },
            {
                # Ingestion worker stores source as imf_weo (not "imf").
                "source": "imf_weo",
                "code": "imf_gdp_ppp",
                "name": "GDP PPP",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "log_scale",
            },
        ],
    },
    "talentDensity": {
        "label": "Talent Density",
        "indicators": [
            {
                "source": "education",
                "code": "SE.TER.CUAT.BA.ZS",
                "name": "Educational attainment, at least Bachelor's or equivalent (% of population 25+)",
                "weight": 0.25,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "education",
                "code": "SE.TER.ENRR",
                "name": "School enrollment, tertiary (% gross)",
                "weight": 0.20,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "education",
                "code": "SL.TLF.ADVN.ZS",
                "name": "Labor force with advanced education (% of total working-age population)",
                "weight": 0.20,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "ilo",
                "code": "SL.TLF.CACT.ZS",
                "name": "Labor force participation rate (% of total population ages 15+)",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "ilo",
                "code": "SL.UEM.TOTL.ZS",
                "name": "Unemployment, total (% of total labor force)",
                "weight": 0.10,
                "direction": "lower_is_better",
                "normalization": "linear",
            },
            {
                "source": "education",
                "code": "SE.XPD.TOTL.GD.ZS",
                "name": "Government expenditure on education (% of GDP)",
                "weight": 0.10,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
        ],
    },
    "taxEnvironment": {
        "label": "Tax Environment",
        "indicators": [
            {
                "source": "tax_foundation",
                "code": "corp_tax_rate",
                "name": "Corporate tax rate (%)",
                "weight": 0.40,
                "direction": "lower_is_better",
                "normalization": "linear",
            },
            {
                "source": "tax_global",
                "code": "GC.TAX.TOTL.GD.ZS",
                "name": "Tax revenue (% of GDP)",
                "weight": 0.35,
                "direction": "lower_is_better",
                "normalization": "linear",
            },
            {
                "source": "tax_global",
                "code": "GC.TAX.GSRV.RV.ZS",
                "name": "Taxes on goods and services (% of revenue)",
                "weight": 0.25,
                "direction": "lower_is_better",
                "normalization": "linear",
            },
        ],
    },
    "regulatoryEase": {
        "label": "Regulatory Ease",
        "indicators": [
            {
                "source": "world_bank",
                "code": "RQ.PER.RNK",
                "name": "Regulatory Quality (WGI Percentile)",
                "weight": 0.25,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "transparency",
                "code": "CC.PER.RNK",
                "name": "Control of Corruption (WGI score)",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "GE.PER.RNK",
                "name": "Government Effectiveness (WGI Percentile)",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_overall",
                "name": "Economic Freedom Index (overall)",
                "weight": 0.13,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "RL.PER.RNK",
                "name": "Rule of Law (WGI Percentile)",
                "weight": 0.12,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_business_freedom",
                "name": "Business Freedom",
                "weight": 0.10,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_trade_freedom",
                "name": "Trade Freedom",
                "weight": 0.05,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_investment_freedom",
                "name": "Investment Freedom",
                "weight": 0.05,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
        ],
    },
    "infrastructure": {
        "label": "Infrastructure",
        "indicators": [
            {
                "source": "infrastructure_expanded",
                "code": "EG.ELC.ACCS.ZS",
                "name": "Access to electricity (% of population)",
                "weight": 0.20,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "infrastructure_expanded",
                "code": "IT.NET.BBND.P2",
                "name": "Fixed broadband subscriptions (per 100 people)",
                "weight": 0.20,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "LP.LPI.OVRL.XQ",
                "name": "Logistics Performance Index",
                "weight": 0.20,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "IT.NET.USER.ZS",
                "name": "Internet users (% of population)",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "infrastructure_expanded",
                "code": "IT.CEL.SETS.P2",
                "name": "Mobile cellular subscriptions (per 100 people)",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "infrastructure_expanded",
                "code": "IS.AIR.DPRT",
                "name": "Air transport, registered carrier departures worldwide",
                "weight": 0.10,
                "direction": "higher_is_better",
                "normalization": "log_scale",
            },
        ],
    },
    "competitorSaturation": {
        "label": "Competitor Saturation",
        "indicators": [
            {
                "source": "world_bank",
                "code": "IC.BUS.NDNS.ZS",
                "name": "New business density (per 1,000 people)",
                "weight": 1.0,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
        ],
    },
    # Composite momentum dimension — no raw indicators; derived from trend_scores
    # in compute_mvi.py after the six base dimensions are scored.
    "trajectory": {
        "label": "Trajectory",
        "description": (
            "Composite momentum score derived from trend direction and rate "
            "across all other dimensions"
        ),
        "weight": 1.0,
        "indicators": [],
        "is_composite": True,
    },
}

# Base (non-composite) dimension keys used for indicator scoring and trend→trajectory.
BASE_DIMENSION_KEYS = [
    key for key, cfg in DIMENSIONS.items() if not cfg.get("is_composite")
]


def _with_trajectory(weights: dict[str, float], trajectory_mult: float) -> dict[str, float]:
    """
    Preserve relative weights among the original six dimensions, then add
    trajectory at (average_base_weight * trajectory_mult).
    Engine normalizes by total weight at score time.
    """
    out = dict(weights)
    avg = sum(weights.values()) / len(weights)
    out["trajectory"] = round(avg * trajectory_mult, 3)
    return out


# Industry vertical weight profiles (API applies these on query; compute_mvi stores equal-weight).
# COUPLING: keep in sync with server/api/src/config/mvi.ts INDUSTRY_VERTICALS.
# Trajectory multipliers: tech_saas/telecom 1.3, manufacturing/energy 0.7, else 1.0.
INDUSTRY_VERTICALS = {
    "all": {
        "label": "All Industries",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.167,
                "talentDensity": 0.167,
                "taxEnvironment": 0.167,
                "regulatoryEase": 0.167,
                "infrastructure": 0.167,
                "competitorSaturation": 0.167,
            },
            1.0,
        ),
    },
    "tech_saas": {
        "label": "Technology & SaaS",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.15,
                "talentDensity": 0.25,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.10,
                "infrastructure": 0.20,
                "competitorSaturation": 0.15,
            },
            1.3,
        ),
    },
    "financial": {
        "label": "Financial Services",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.20,
                "talentDensity": 0.15,
                "taxEnvironment": 0.20,
                "regulatoryEase": 0.25,
                "infrastructure": 0.10,
                "competitorSaturation": 0.10,
            },
            1.0,
        ),
    },
    "manufacturing": {
        "label": "Manufacturing",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.15,
                "talentDensity": 0.10,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.20,
                "infrastructure": 0.25,
                "competitorSaturation": 0.15,
            },
            0.7,
        ),
    },
    "healthcare": {
        "label": "Healthcare & Life Sciences",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.20,
                "talentDensity": 0.20,
                "taxEnvironment": 0.10,
                "regulatoryEase": 0.25,
                "infrastructure": 0.15,
                "competitorSaturation": 0.10,
            },
            1.0,
        ),
    },
    "ecommerce": {
        "label": "E-Commerce & Retail",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.25,
                "talentDensity": 0.10,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.10,
                "infrastructure": 0.25,
                "competitorSaturation": 0.15,
            },
            1.0,
        ),
    },
    "energy": {
        "label": "Energy & Renewables",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.15,
                "talentDensity": 0.10,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.25,
                "infrastructure": 0.25,
                "competitorSaturation": 0.10,
            },
            0.7,
        ),
    },
    "professional": {
        "label": "Professional Services",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.15,
                "talentDensity": 0.30,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.15,
                "infrastructure": 0.10,
                "competitorSaturation": 0.15,
            },
            1.0,
        ),
    },
    "logistics": {
        "label": "Logistics & Supply Chain",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.20,
                "talentDensity": 0.05,
                "taxEnvironment": 0.15,
                "regulatoryEase": 0.15,
                "infrastructure": 0.35,
                "competitorSaturation": 0.10,
            },
            1.0,
        ),
    },
    "telecom": {
        "label": "Telecommunications",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.20,
                "talentDensity": 0.15,
                "taxEnvironment": 0.10,
                "regulatoryEase": 0.20,
                "infrastructure": 0.25,
                "competitorSaturation": 0.10,
            },
            1.3,
        ),
    },
    "consumer_goods": {
        "label": "Consumer Goods & CPG",
        "weights": _with_trajectory(
            {
                "marketSizeAndGrowth": 0.25,
                "talentDensity": 0.10,
                "taxEnvironment": 0.10,
                "regulatoryEase": 0.15,
                "infrastructure": 0.20,
                "competitorSaturation": 0.20,
            },
            1.0,
        ),
    },
}

# Legacy equal-weight map used by compute_mvi batch (DB industry_vertical key).
VERTICAL_WEIGHTS = {
    "all_industries": INDUSTRY_VERTICALS["all"]["weights"],
}

INDUSTRY_VERTICAL = "all_industries"
MIN_DIMENSIONS_FOR_OVERALL = 3
