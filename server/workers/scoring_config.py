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

# Industry vertical weight profiles (API applies these on query; compute_mvi stores equal-weight).
# COUPLING: keep in sync with server/api/src/config/mvi.ts INDUSTRY_VERTICALS.
INDUSTRY_VERTICALS = {
    "all": {
        "label": "All Industries",
        "weights": {
            "marketSizeAndGrowth": 0.167,
            "talentDensity": 0.167,
            "taxEnvironment": 0.167,
            "regulatoryEase": 0.167,
            "infrastructure": 0.167,
            "competitorSaturation": 0.167,
        },
    },
    "tech_saas": {
        "label": "Technology & SaaS",
        "weights": {
            "marketSizeAndGrowth": 0.15,
            "talentDensity": 0.25,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.10,
            "infrastructure": 0.20,
            "competitorSaturation": 0.15,
        },
    },
    "financial": {
        "label": "Financial Services",
        "weights": {
            "marketSizeAndGrowth": 0.20,
            "talentDensity": 0.15,
            "taxEnvironment": 0.20,
            "regulatoryEase": 0.25,
            "infrastructure": 0.10,
            "competitorSaturation": 0.10,
        },
    },
    "manufacturing": {
        "label": "Manufacturing",
        "weights": {
            "marketSizeAndGrowth": 0.15,
            "talentDensity": 0.10,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.20,
            "infrastructure": 0.25,
            "competitorSaturation": 0.15,
        },
    },
    "healthcare": {
        "label": "Healthcare & Life Sciences",
        "weights": {
            "marketSizeAndGrowth": 0.20,
            "talentDensity": 0.20,
            "taxEnvironment": 0.10,
            "regulatoryEase": 0.25,
            "infrastructure": 0.15,
            "competitorSaturation": 0.10,
        },
    },
    "ecommerce": {
        "label": "E-Commerce & Retail",
        "weights": {
            "marketSizeAndGrowth": 0.25,
            "talentDensity": 0.10,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.10,
            "infrastructure": 0.25,
            "competitorSaturation": 0.15,
        },
    },
    "energy": {
        "label": "Energy & Renewables",
        "weights": {
            "marketSizeAndGrowth": 0.15,
            "talentDensity": 0.10,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.25,
            "infrastructure": 0.25,
            "competitorSaturation": 0.10,
        },
    },
    "professional": {
        "label": "Professional Services",
        "weights": {
            "marketSizeAndGrowth": 0.15,
            "talentDensity": 0.30,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.15,
            "infrastructure": 0.10,
            "competitorSaturation": 0.15,
        },
    },
    "logistics": {
        "label": "Logistics & Supply Chain",
        "weights": {
            "marketSizeAndGrowth": 0.20,
            "talentDensity": 0.05,
            "taxEnvironment": 0.15,
            "regulatoryEase": 0.15,
            "infrastructure": 0.35,
            "competitorSaturation": 0.10,
        },
    },
    "telecom": {
        "label": "Telecommunications",
        "weights": {
            "marketSizeAndGrowth": 0.20,
            "talentDensity": 0.15,
            "taxEnvironment": 0.10,
            "regulatoryEase": 0.20,
            "infrastructure": 0.25,
            "competitorSaturation": 0.10,
        },
    },
    "consumer_goods": {
        "label": "Consumer Goods & CPG",
        "weights": {
            "marketSizeAndGrowth": 0.25,
            "talentDensity": 0.10,
            "taxEnvironment": 0.10,
            "regulatoryEase": 0.15,
            "infrastructure": 0.20,
            "competitorSaturation": 0.20,
        },
    },
}

# Legacy equal-weight map used by compute_mvi batch (DB industry_vertical key).
VERTICAL_WEIGHTS = {
    "all_industries": INDUSTRY_VERTICALS["all"]["weights"],
}

INDUSTRY_VERTICAL = "all_industries"
MIN_DIMENSIONS_FOR_OVERALL = 3
