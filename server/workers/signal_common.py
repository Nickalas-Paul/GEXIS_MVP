"""
Shared signal classification + country extraction for Layer 2 workers.

Used by Polymarket, Kalshi, Metaculus, and (patterns) GDELT ingest scripts.
"""

from __future__ import annotations

import re
from typing import Optional

from country_aliases import NAME_TO_ISO

NEGATIVE_KEYWORDS = [
    "ai model",
    "social media",
    "sports",
    "entertainment",
    "celebrity",
    "movie",
    "music",
    "video game",
    "app store",
    "streaming",
    "tennis",
    "football",
    "nba",
    "mlb",
    "soccer",
    "points scored",
    "league cup",
]

# Phrase rules: first matching rule wins (more specific first).
# Do not include trajectory — apply_signal_adjustments only touches BASE_DIMENSION_KEYS.
SIGNAL_RULES: list[tuple[tuple[str, ...], str, list[str], str]] = [
    (
        (
            "impose tariff",
            "impose tariffs",
            "new tariff",
            "new tariffs",
            "tariff on",
            "tariffs on",
            "import duty",
            "trade war",
            "import tax",
            "tariff increase",
            "tariff hike",
            "tariff reduction",
            "china tariff",
            "us tariff",
            "tariffs",
            "tariff",
        ),
        "tariff_risk",
        ["taxEnvironment", "competitorSaturation"],
        "negative",
    ),
    (
        (
            "economic sanction",
            "economic sanctions",
            "impose sanctions",
            "sanction against",
            "sanctions against",
            "sanctions on",
            "trade embargo",
            "export control",
            "export controls",
            "embargo on",
            "sanctions",
            "sanction",
        ),
        "sanctions",
        ["regulatoryEase", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        (
            "trade deal",
            "trade agreement",
            "free trade",
            "trade pact",
            "fta ",
            " fta",
            "free trade agreement",
        ),
        "trade_agreement",
        ["marketSizeAndGrowth", "competitorSaturation"],
        "positive",
    ),
    (
        (
            "new regulation",
            "regulatory reform",
            "deregulation",
            "compliance requirement",
            "policy change",
            "business regulation",
            "capital gains tax",
        ),
        "regulatory_change",
        ["regulatoryEase"],
        "neutral",
    ),
    (
        (
            "coup",
            "political crisis",
            "regime change",
            "civil unrest",
            "government collapse",
            "impeachment",
            "martial law",
            "government shutdown",
            "debt ceiling",
        ),
        "political_instability",
        ["regulatoryEase"],
        "negative",
    ),
    (
        (
            "currency devaluation",
            "currency crisis",
            "exchange rate collapse",
            "hyperinflation",
            "dollarize",
            "dollarization",
        ),
        "currency_crisis",
        ["taxEnvironment", "marketSizeAndGrowth"],
        "negative",
    ),
    (
        (
            "recession",
            "gdp contraction",
            "gdp growth",
            "interest rate",
            "central bank",
            "economic downturn",
            "fiscal policy",
            "rate cut",
            "rate hike",
            "fed rate",
            "fed funds",
            "federal funds",
            "cpi inflation",
            "cpi rise",
            "inflation",
        ),
        "economic_policy",
        ["marketSizeAndGrowth"],
        "neutral",
    ),
]

EU_TOP5 = ["DEU", "FRA", "ITA", "ESP", "NLD"]
BRICS = ["BRA", "RUS", "IND", "CHN", "ZAF"]

ABBREV_PATTERNS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"\b(?:u\.?s\.?a\.?|united states(?: of america)?)\b", re.I), ["USA"]),
    (re.compile(r"\b(?:u\.?k\.?|united kingdom|britain|great britain)\b", re.I), ["GBR"]),
    (re.compile(r"\b(?:european union|eurozone)\b", re.I), EU_TOP5),
    (re.compile(r"\beu\b", re.I), EU_TOP5),
    (re.compile(r"\bbrics\b", re.I), BRICS),
]

DEMONYM_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bchinese\b", re.I), "CHN"),
    (re.compile(r"\bmexican\b", re.I), "MEX"),
    (re.compile(r"\bcanadian\b", re.I), "CAN"),
    (re.compile(r"\bjapanese\b", re.I), "JPN"),
    (re.compile(r"\bindian\b", re.I), "IND"),
    (re.compile(r"\bbrazilian\b", re.I), "BRA"),
    (re.compile(r"\brussian\b", re.I), "RUS"),
    (re.compile(r"\bukrainian\b", re.I), "UKR"),
    (re.compile(r"\biranian\b", re.I), "IRN"),
    (re.compile(r"\bisraeli\b", re.I), "ISR"),
    (re.compile(r"\bsouth korean\b", re.I), "KOR"),
    (re.compile(r"\bnorth korean\b", re.I), "PRK"),
    (re.compile(r"\btaiwanese\b", re.I), "TWN"),
    (re.compile(r"\baustralian\b", re.I), "AUS"),
    (re.compile(r"\bvietnamese\b", re.I), "VNM"),
    (re.compile(r"\bturkish\b", re.I), "TUR"),
    (re.compile(r"\bgerman\b", re.I), "DEU"),
    (re.compile(r"\bfrench\b", re.I), "FRA"),
    (re.compile(r"\bcuban\b", re.I), "CUB"),
    (re.compile(r"\bargentine\b", re.I), "ARG"),
]

CURRENCY_NOISE = re.compile(
    r"\b(?:us dollar|u\.?s\.? dollar|usd|greenback|yen|euro|renminbi|yuan|"
    r"pound sterling|gbp|jpy|cny|mxn)\b",
    re.I,
)

# US-federal topic hints → default USA when no country found
US_TOPIC = re.compile(
    r"\b(?:fed(?:eral)? funds|federal reserve|fomc|cpi|pce|debt ceiling|"
    r"government shutdown|usmca|congress|white house|bea)\b",
    re.I,
)


def severity_from_probability(probability: float) -> int:
    if probability >= 0.75:
        return 5
    if probability >= 0.60:
        return 4
    if probability >= 0.45:
        return 3
    if probability >= 0.30:
        return 2
    return 1


def has_negative_keyword(text: str) -> bool:
    lower = text.lower()
    return any(term in lower for term in NEGATIVE_KEYWORDS)


def classify_signal(text: str) -> Optional[tuple[str, list[str], str]]:
    if has_negative_keyword(text):
        return None
    lower = text.lower()
    for phrases, signal_type, dims, direction in SIGNAL_RULES:
        if any(p in lower for p in phrases):
            return signal_type, dims, direction
    return None


def _country_name_patterns() -> list[tuple[re.Pattern[str], str]]:
    patterns: list[tuple[re.Pattern[str], str]] = []
    short_ok = {
        "iran",
        "iraq",
        "oman",
        "peru",
        "cuba",
        "chad",
        "fiji",
        "togo",
        "mali",
        "laos",
    }
    for name, iso in sorted(NAME_TO_ISO.items(), key=lambda kv: len(kv[0]), reverse=True):
        if len(name) < 4 and name not in short_ok:
            continue
        patterns.append((re.compile(rf"\b{re.escape(name)}\b", re.I), iso))
    return patterns


_COUNTRY_NAME_PATTERNS = _country_name_patterns()

# Lowercase country name / common GDELT sourcecountry labels → ISO3
_NAME_LOOKUP: dict[str, str] = {name.lower(): iso for name, iso in NAME_TO_ISO.items()}
_NAME_LOOKUP.update(
    {
        "united states": "USA",
        "united states of america": "USA",
        "u.s.": "USA",
        "u.s.a.": "USA",
        "usa": "USA",
        "uk": "GBR",
        "u.k.": "GBR",
        "united kingdom": "GBR",
        "great britain": "GBR",
        "russia": "RUS",
        "south korea": "KOR",
        "north korea": "PRK",
        "czech republic": "CZE",
        "czechia": "CZE",
        "turkey": "TUR",
        "uae": "ARE",
        "united arab emirates": "ARE",
    }
)


def iso_from_country_label(label: str | None) -> Optional[str]:
    """Map a free-text country label (e.g. GDELT sourcecountry) to ISO3."""
    if not label:
        return None
    key = label.strip().lower()
    if not key:
        return None
    if key in _NAME_LOOKUP:
        return _NAME_LOOKUP[key]
    # Try longest NAME_TO_ISO substring match
    for name, iso in sorted(NAME_TO_ISO.items(), key=lambda kv: len(kv[0]), reverse=True):
        if name.lower() == key:
            return iso
    return None


def extract_iso_codes(text: str, *, default_usa_on_us_topic: bool = False) -> list[str]:
    """Word-boundary country extraction; ignores currency-only mentions."""
    found: set[str] = set()

    for pattern, isos in ABBREV_PATTERNS:
        if pattern.search(text):
            found.update(isos)

    for pattern, iso in DEMONYM_PATTERNS:
        if pattern.search(text):
            found.add(iso)

    for pattern, iso in _COUNTRY_NAME_PATTERNS:
        if pattern.search(text):
            found.add(iso)

    if CURRENCY_NOISE.search(text):
        text_wo_currency = CURRENCY_NOISE.sub(" ", text)
        kept: set[str] = set()
        for pattern, isos in ABBREV_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.update(isos)
        for pattern, iso in DEMONYM_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.add(iso)
        for pattern, iso in _COUNTRY_NAME_PATTERNS:
            if pattern.search(text_wo_currency):
                kept.add(iso)
        found = kept

    if not found and default_usa_on_us_topic and US_TOPIC.search(text):
        found.add("USA")

    return sorted(found)
