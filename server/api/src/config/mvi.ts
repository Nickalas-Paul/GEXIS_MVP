/**
 * MVI display metadata for the API.
 *
 * COUPLING NOTE: Indicator weights / keys must stay aligned with
 * server/workers/scoring_config.py (source of truth for compute_mvi.py).
 * This file is the source of truth for client-facing labels and descriptions.
 * Sync manually when either side changes.
 */

export const MVI_SCORING_VERSION = '0.1.0';

export type DimensionKey =
  | 'marketSizeAndGrowth'
  | 'talentDensity'
  | 'taxEnvironment'
  | 'regulatoryEase'
  | 'infrastructure'
  | 'competitorSaturation';

export interface IndicatorMeta {
  source: string;
  code: string;
  name: string;
  weight: number;
  isProxy?: boolean;
}

export interface DimensionMeta {
  key: DimensionKey;
  label: string;
  description: string;
  indicators: IndicatorMeta[];
}

export const MVI_DIMENSIONS: DimensionMeta[] = [
  {
    key: 'marketSizeAndGrowth',
    label: 'Market Size & Growth',
    description: 'GDP, growth rates, population, and PPP-adjusted economic scale',
    indicators: [
      {
        source: 'world_bank',
        code: 'NY.GDP.MKTP.CD',
        name: 'GDP (current US$)',
        weight: 0.35,
      },
      {
        source: 'world_bank',
        code: 'NY.GDP.MKTP.KD.ZG',
        name: 'GDP growth (annual %)',
        weight: 0.35,
      },
      {
        source: 'world_bank',
        code: 'SP.POP.TOTL',
        name: 'Population',
        weight: 0.15,
      },
      {
        source: 'imf_weo',
        code: 'imf_gdp_ppp',
        name: 'GDP PPP',
        weight: 0.15,
      },
    ],
  },
  {
    key: 'talentDensity',
    label: 'Talent Density',
    description: 'Tertiary education attainment and skilled workforce density',
    indicators: [
      {
        source: 'oecd',
        code: 'oecd_tertiary_attainment',
        name: 'Tertiary education attainment (%)',
        weight: 1.0,
        isProxy: true,
      },
    ],
  },
  {
    key: 'taxEnvironment',
    label: 'Tax Environment',
    description: 'Corporate tax competitiveness for market entry',
    indicators: [
      {
        source: 'tax_foundation',
        code: 'corp_tax_rate',
        name: 'Corporate tax rate (%)',
        weight: 1.0,
      },
    ],
  },
  {
    key: 'regulatoryEase',
    label: 'Regulatory Ease',
    description: 'Economic freedom and ease of operating a business',
    indicators: [
      {
        source: 'heritage',
        code: 'heritage_overall',
        name: 'Economic Freedom Index (overall)',
        weight: 0.4,
      },
      {
        source: 'heritage',
        code: 'heritage_business_freedom',
        name: 'Business Freedom',
        weight: 0.3,
      },
      {
        source: 'heritage',
        code: 'heritage_trade_freedom',
        name: 'Trade Freedom',
        weight: 0.15,
      },
      {
        source: 'heritage',
        code: 'heritage_investment_freedom',
        name: 'Investment Freedom',
        weight: 0.15,
      },
    ],
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    description: 'Digital connectivity and logistics performance',
    indicators: [
      {
        source: 'world_bank',
        code: 'IT.NET.USER.ZS',
        name: 'Internet users (% of population)',
        weight: 0.5,
      },
      {
        source: 'world_bank',
        code: 'LP.LPI.OVRL.XQ',
        name: 'Logistics Performance Index',
        weight: 0.5,
      },
    ],
  },
  {
    key: 'competitorSaturation',
    label: 'Competitor Saturation',
    description: 'New business formation intensity as a market-activity proxy',
    indicators: [
      {
        source: 'world_bank',
        code: 'IC.BUS.NDNS.ZS',
        name: 'New business density (per 1,000 people)',
        weight: 1.0,
      },
    ],
  },
];

export const SOURCE_CATALOG: Record<
  string,
  { name: string; url: string; refreshCadence: string }
> = {
  world_bank: {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org',
    refreshCadence: 'Annual',
  },
  imf_weo: {
    name: 'IMF World Economic Outlook',
    url: 'https://data.imf.org/en/datasets/IMF.RES:WEO',
    refreshCadence: 'Biannual (Apr/Oct)',
  },
  heritage: {
    name: 'Heritage Foundation Index of Economic Freedom',
    url: 'https://indexdotnet.azurewebsites.net/index/download',
    refreshCadence: 'Annual',
  },
  tax_foundation: {
    name: 'Tax Foundation International Tax Competitiveness Index',
    url: 'https://taxfoundation.org/research/all/global/2025-international-tax-competitiveness-index/',
    refreshCadence: 'Annual',
  },
  oecd: {
    name: 'OECD / World Bank education proxy',
    url: 'https://data-explorer.oecd.org/',
    refreshCadence: 'Annual',
  },
};

/** DB key used by compute_mvi.py / mvi_scores.industry_vertical (equal-weight batch). */
export const STORED_MVI_VERTICAL = 'all_industries';

export type DimensionWeights = Record<DimensionKey, number>;

export interface IndustryVertical {
  key: string;
  label: string;
  weights: DimensionWeights;
}

/**
 * Industry vertical weight profiles for on-the-fly overall MVI recomputation.
 * COUPLING: keep in sync with server/workers/scoring_config.py INDUSTRY_VERTICALS.
 * Dimension scores are stored once (equal-weight); overall is reweighted at query time.
 */
export const INDUSTRY_VERTICALS: IndustryVertical[] = [
  {
    key: 'all',
    label: 'All Industries',
    weights: {
      marketSizeAndGrowth: 0.167,
      talentDensity: 0.167,
      taxEnvironment: 0.167,
      regulatoryEase: 0.167,
      infrastructure: 0.167,
      competitorSaturation: 0.167,
    },
  },
  {
    key: 'tech_saas',
    label: 'Technology & SaaS',
    weights: {
      marketSizeAndGrowth: 0.15,
      talentDensity: 0.25,
      taxEnvironment: 0.15,
      regulatoryEase: 0.1,
      infrastructure: 0.2,
      competitorSaturation: 0.15,
    },
  },
  {
    key: 'financial',
    label: 'Financial Services',
    weights: {
      marketSizeAndGrowth: 0.2,
      talentDensity: 0.15,
      taxEnvironment: 0.2,
      regulatoryEase: 0.25,
      infrastructure: 0.1,
      competitorSaturation: 0.1,
    },
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    weights: {
      marketSizeAndGrowth: 0.15,
      talentDensity: 0.1,
      taxEnvironment: 0.15,
      regulatoryEase: 0.2,
      infrastructure: 0.25,
      competitorSaturation: 0.15,
    },
  },
  {
    key: 'healthcare',
    label: 'Healthcare & Life Sciences',
    weights: {
      marketSizeAndGrowth: 0.2,
      talentDensity: 0.2,
      taxEnvironment: 0.1,
      regulatoryEase: 0.25,
      infrastructure: 0.15,
      competitorSaturation: 0.1,
    },
  },
  {
    key: 'ecommerce',
    label: 'E-Commerce & Retail',
    weights: {
      marketSizeAndGrowth: 0.25,
      talentDensity: 0.1,
      taxEnvironment: 0.15,
      regulatoryEase: 0.1,
      infrastructure: 0.25,
      competitorSaturation: 0.15,
    },
  },
  {
    key: 'energy',
    label: 'Energy & Renewables',
    weights: {
      marketSizeAndGrowth: 0.15,
      talentDensity: 0.1,
      taxEnvironment: 0.15,
      regulatoryEase: 0.25,
      infrastructure: 0.25,
      competitorSaturation: 0.1,
    },
  },
  {
    key: 'professional',
    label: 'Professional Services',
    weights: {
      marketSizeAndGrowth: 0.15,
      talentDensity: 0.3,
      taxEnvironment: 0.15,
      regulatoryEase: 0.15,
      infrastructure: 0.1,
      competitorSaturation: 0.15,
    },
  },
  {
    key: 'logistics',
    label: 'Logistics & Supply Chain',
    weights: {
      marketSizeAndGrowth: 0.2,
      talentDensity: 0.05,
      taxEnvironment: 0.15,
      regulatoryEase: 0.15,
      infrastructure: 0.35,
      competitorSaturation: 0.1,
    },
  },
  {
    key: 'telecom',
    label: 'Telecommunications',
    weights: {
      marketSizeAndGrowth: 0.2,
      talentDensity: 0.15,
      taxEnvironment: 0.1,
      regulatoryEase: 0.2,
      infrastructure: 0.25,
      competitorSaturation: 0.1,
    },
  },
  {
    key: 'consumer_goods',
    label: 'Consumer Goods & CPG',
    weights: {
      marketSizeAndGrowth: 0.25,
      talentDensity: 0.1,
      taxEnvironment: 0.1,
      regulatoryEase: 0.15,
      infrastructure: 0.2,
      competitorSaturation: 0.2,
    },
  },
];

export const DEFAULT_VERTICAL = 'all';

const VERTICAL_BY_KEY = new Map(INDUSTRY_VERTICALS.map((v) => [v.key, v]));

export function resolveVerticalKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_VERTICAL;
  const key = raw.trim();
  // Legacy DB / URL alias
  if (key === 'all_industries') return DEFAULT_VERTICAL;
  if (VERTICAL_BY_KEY.has(key)) return key;
  return DEFAULT_VERTICAL;
}

export function getVerticalWeights(verticalKey: string): DimensionWeights {
  const resolved = resolveVerticalKey(verticalKey);
  return (
    VERTICAL_BY_KEY.get(resolved)?.weights ??
    VERTICAL_BY_KEY.get(DEFAULT_VERTICAL)!.weights
  );
}

/** Weighted overall from stored dimension scores; renormalizes over non-null dims. */
export function computeWeightedOverall(
  dimensions: Partial<Record<DimensionKey, number | null>> | null | undefined,
  verticalKey: string = DEFAULT_VERTICAL
): number | null {
  if (!dimensions) return null;
  const weights = getVerticalWeights(verticalKey);
  let numerator = 0;
  let denominator = 0;
  (Object.keys(weights) as DimensionKey[]).forEach((key) => {
    const raw = dimensions[key];
    if (raw == null) return;
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    const w = weights[key];
    numerator += value * w;
    denominator += w;
  });
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}
