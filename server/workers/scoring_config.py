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
                "source": "oecd",
                "code": "oecd_tertiary_attainment",
                "name": "Tertiary education attainment (%)",
                "weight": 1.0,
                "direction": "higher_is_better",
                "normalization": "linear",
                # Step 2 used World Bank SE.TER.CUAT.BA.ZS as an OECD-member proxy.
                "is_proxy": True,
            },
            # STEM share placeholder — uncomment when non-null source data arrives:
            # {
            #     "source": "oecd",
            #     "code": "oecd_stem_share",
            #     "name": "STEM graduates (% of all)",
            #     "weight": 0.5,
            #     "direction": "higher_is_better",
            #     "normalization": "linear",
            # },
        ],
    },
    "taxEnvironment": {
        "label": "Tax Environment",
        "indicators": [
            {
                "source": "tax_foundation",
                "code": "corp_tax_rate",
                "name": "Corporate tax rate (%)",
                "weight": 1.0,
                "direction": "lower_is_better",
                "normalization": "linear",
            },
        ],
    },
    "regulatoryEase": {
        "label": "Regulatory Ease",
        "indicators": [
            {
                "source": "heritage",
                "code": "heritage_overall",
                "name": "Economic Freedom Index (overall)",
                "weight": 0.4,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_business_freedom",
                "name": "Business Freedom",
                "weight": 0.3,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_trade_freedom",
                "name": "Trade Freedom",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "heritage",
                "code": "heritage_investment_freedom",
                "name": "Investment Freedom",
                "weight": 0.15,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
        ],
    },
    "infrastructure": {
        "label": "Infrastructure",
        "indicators": [
            {
                "source": "world_bank",
                "code": "IT.NET.USER.ZS",
                "name": "Internet users (% of population)",
                "weight": 0.5,
                "direction": "higher_is_better",
                "normalization": "linear",
            },
            {
                "source": "world_bank",
                "code": "LP.LPI.OVRL.XQ",
                "name": "Logistics Performance Index",
                "weight": 0.5,
                "direction": "higher_is_better",
                "normalization": "linear",
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
}

# Industry vertical overrides (Phase 6 — scaffold now, activate later).
# Default: all six dimensions weighted equally.
VERTICAL_WEIGHTS = {
    "all_industries": {
        "marketSizeAndGrowth": 1 / 6,
        "talentDensity": 1 / 6,
        "taxEnvironment": 1 / 6,
        "regulatoryEase": 1 / 6,
        "infrastructure": 1 / 6,
        "competitorSaturation": 1 / 6,
    },
    # "saas": {
    #     "marketSizeAndGrowth": 0.25,
    #     "talentDensity": 0.25,
    #     "taxEnvironment": 0.15,
    #     "regulatoryEase": 0.15,
    #     "infrastructure": 0.15,
    #     "competitorSaturation": 0.05,
    # },
}

INDUSTRY_VERTICAL = "all_industries"
MIN_DIMENSIONS_FOR_OVERALL = 3
