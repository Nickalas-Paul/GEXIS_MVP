/**
 * Client-facing MVI display metadata.
 * Keep labels/descriptions/indicators aligned with:
 *   - server/api/src/config/mvi.ts
 *   - server/workers/scoring_config.py
 *
 * Adding a dimension here (e.g. Trajectory) automatically surfaces it on
 * the geography detail page and the public methodology page.
 */

export type DimensionKey =
  | 'marketSizeAndGrowth'
  | 'talentDensity'
  | 'taxEnvironment'
  | 'regulatoryEase'
  | 'infrastructure'
  | 'competitorSaturation'
  | 'trajectory';

export type IndicatorDirection = 'higher_is_better' | 'lower_is_better';
export type IndicatorNormalization = 'linear' | 'log_scale';

export type IndicatorDisplay = {
  code: string;
  name: string;
  source: string;
  weight: number;
  direction: IndicatorDirection;
  normalization: IndicatorNormalization;
  isProxy?: boolean;
  notes?: string;
};

export type DimensionDisplay = {
  key: DimensionKey;
  label: string;
  description: string;
  /** Indicator codes that belong to this dimension (for source filtering). */
  indicatorCodes: string[];
  indicators: IndicatorDisplay[];
  /** True when derived from trend_scores rather than raw indicators. */
  isComposite?: boolean;
};

export const MVI_DIMENSION_DISPLAY: DimensionDisplay[] = [
  {
    key: 'marketSizeAndGrowth',
    label: 'Market Size & Growth',
    description: 'GDP, growth rates, population, and PPP-adjusted economic scale',
    indicatorCodes: [
      'NY.GDP.MKTP.CD',
      'NY.GDP.MKTP.KD.ZG',
      'SP.POP.TOTL',
      'imf_gdp_ppp',
    ],
    indicators: [
      {
        code: 'NY.GDP.MKTP.CD',
        name: 'GDP (current US$)',
        source: 'world_bank',
        weight: 0.35,
        direction: 'higher_is_better',
        normalization: 'log_scale',
      },
      {
        code: 'NY.GDP.MKTP.KD.ZG',
        name: 'GDP growth (annual %)',
        source: 'world_bank',
        weight: 0.35,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'SP.POP.TOTL',
        name: 'Population',
        source: 'world_bank',
        weight: 0.15,
        direction: 'higher_is_better',
        normalization: 'log_scale',
      },
      {
        code: 'imf_gdp_ppp',
        name: 'GDP PPP',
        source: 'imf_weo',
        weight: 0.15,
        direction: 'higher_is_better',
        normalization: 'log_scale',
      },
    ],
  },
  {
    key: 'talentDensity',
    label: 'Talent Density',
    description: 'Tertiary education attainment and skilled workforce density',
    indicatorCodes: ['oecd_tertiary_attainment'],
    indicators: [
      {
        code: 'oecd_tertiary_attainment',
        name: 'Tertiary education attainment (%)',
        source: 'oecd',
        weight: 1.0,
        direction: 'higher_is_better',
        normalization: 'linear',
        isProxy: true,
        notes:
          'Currently backed by a World Bank bachelor+ attainment series for OECD members — treated as proxy data.',
      },
    ],
  },
  {
    key: 'taxEnvironment',
    label: 'Tax Environment',
    description: 'Corporate tax competitiveness for market entry',
    indicatorCodes: ['corp_tax_rate'],
    indicators: [
      {
        code: 'corp_tax_rate',
        name: 'Corporate tax rate (%)',
        source: 'tax_foundation',
        weight: 1.0,
        direction: 'lower_is_better',
        normalization: 'linear',
        notes: 'Coverage today is roughly OECD economies (~38 countries).',
      },
    ],
  },
  {
    key: 'regulatoryEase',
    label: 'Regulatory Ease',
    description: 'Economic freedom and ease of operating a business',
    indicatorCodes: [
      'RQ.PER.RNK',
      'GE.PER.RNK',
      'RL.PER.RNK',
      'heritage_overall',
      'heritage_business_freedom',
      'heritage_trade_freedom',
      'heritage_investment_freedom',
    ],
    indicators: [
      {
        code: 'RQ.PER.RNK',
        name: 'Regulatory Quality (WGI Percentile)',
        source: 'world_bank',
        weight: 0.3,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'GE.PER.RNK',
        name: 'Government Effectiveness (WGI Percentile)',
        source: 'world_bank',
        weight: 0.2,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'RL.PER.RNK',
        name: 'Rule of Law (WGI Percentile)',
        source: 'world_bank',
        weight: 0.15,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'heritage_overall',
        name: 'Economic Freedom Index (overall)',
        source: 'heritage',
        weight: 0.14,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'heritage_business_freedom',
        name: 'Business Freedom',
        source: 'heritage',
        weight: 0.11,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'heritage_trade_freedom',
        name: 'Trade Freedom',
        source: 'heritage',
        weight: 0.05,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'heritage_investment_freedom',
        name: 'Investment Freedom',
        source: 'heritage',
        weight: 0.05,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
    ],
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    description: 'Digital connectivity and logistics performance',
    indicatorCodes: ['IT.NET.USER.ZS', 'LP.LPI.OVRL.XQ'],
    indicators: [
      {
        code: 'IT.NET.USER.ZS',
        name: 'Internet users (% of population)',
        source: 'world_bank',
        weight: 0.5,
        direction: 'higher_is_better',
        normalization: 'linear',
      },
      {
        code: 'LP.LPI.OVRL.XQ',
        name: 'Logistics Performance Index',
        source: 'world_bank',
        weight: 0.5,
        direction: 'higher_is_better',
        normalization: 'linear',
        notes: 'LPI updates infrequently; engine uses the latest non-null observation.',
      },
    ],
  },
  {
    key: 'competitorSaturation',
    label: 'Competitor Saturation',
    description: 'New business formation intensity as a market-activity proxy',
    indicatorCodes: ['IC.BUS.NDNS.ZS'],
    indicators: [
      {
        code: 'IC.BUS.NDNS.ZS',
        name: 'New business density (per 1,000 people)',
        source: 'world_bank',
        weight: 1.0,
        direction: 'higher_is_better',
        normalization: 'linear',
        notes:
          'Higher formation rates score higher as a market-activity proxy — not industry HHI.',
      },
    ],
  },
  {
    key: 'trajectory',
    label: 'Trajectory',
    description:
      'Composite momentum score derived from trend direction and rate across all other dimensions',
    indicatorCodes: [],
    indicators: [],
    isComposite: true,
  },
];

/** Short source labels for pills on the detail / methodology pages. */
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  world_bank: 'World Bank',
  imf_weo: 'IMF WEO',
  heritage: 'Heritage Foundation',
  tax_foundation: 'Tax Foundation',
  oecd: 'OECD',
};

export type SourceCatalogEntry = {
  key: string;
  name: string;
  role: string;
  coverageApprox: string;
  refreshCadence: string;
};

/** Active source catalog for methodology / docs surfaces. */
export const MVI_SOURCE_CATALOG: SourceCatalogEntry[] = [
  {
    key: 'world_bank',
    name: 'World Bank Open Data / WGI',
    role: 'GDP, growth, population, internet, LPI, business density, WGI governance scores',
    coverageApprox: '~190–200 countries',
    refreshCadence: 'Annual',
  },
  {
    key: 'imf_weo',
    name: 'IMF World Economic Outlook',
    role: 'GDP PPP',
    coverageApprox: '~190 countries',
    refreshCadence: 'Biannual (Apr/Oct)',
  },
  {
    key: 'heritage',
    name: 'Heritage Foundation Index of Economic Freedom',
    role: 'Regulatory / freedom components',
    coverageApprox: '~165–175 countries',
    refreshCadence: 'Annual',
  },
  {
    key: 'tax_foundation',
    name: 'Tax Foundation ITCI',
    role: 'Corporate tax rates',
    coverageApprox: '~38 countries (OECD-focused)',
    refreshCadence: 'Annual',
  },
  {
    key: 'oecd',
    name: 'OECD / World Bank education proxy',
    role: 'Talent density tertiary attainment proxy',
    coverageApprox: '~38 countries',
    refreshCadence: 'Annual',
  },
];

export const MVI_SCORING_VERSION_LABEL = '0.1.0';

export function sourceDisplayName(sourceKey: string): string {
  return SOURCE_DISPLAY_NAMES[sourceKey] ?? sourceKey;
}

export function getDimensionDisplay(key: string): DimensionDisplay | undefined {
  return MVI_DIMENSION_DISPLAY.find((d) => d.key === key);
}

export function formatNormalization(n: IndicatorNormalization): string {
  return n === 'log_scale' ? 'Log scale' : 'Linear';
}

export function formatDirection(d: IndicatorDirection): string {
  return d === 'lower_is_better' ? 'Lower is better' : 'Higher is better';
}
