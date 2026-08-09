/**
 * MVI display metadata for the API.
 *
 * COUPLING NOTE: Indicator weights / keys must stay aligned with
 * server/workers/scoring_config.py (source of truth for compute_mvi.py).
 * This file is the source of truth for client-facing labels and descriptions.
 * Sync manually when either side changes.
 */

import {
  INDUSTRY_VERTICAL_KEYS,
  INDUSTRY_VERTICAL_LABELS,
  type IndustryVerticalKey,
} from '@gexis/gexis-core';

export const MVI_SCORING_VERSION = '0.1.0';

export type DimensionKey =
  | 'marketSizeAndGrowth'
  | 'talentDensity'
  | 'taxEnvironment'
  | 'regulatoryEase'
  | 'infrastructure'
  | 'competitorSaturation'
  | 'trajectory';

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
  /** True when the dimension is derived from trend_scores, not raw indicators. */
  isComposite?: boolean;
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
      // WGI (~0.65) — broader country coverage than Heritage
      {
        source: 'world_bank',
        code: 'RQ.PER.RNK',
        name: 'Regulatory Quality (WGI Percentile)',
        weight: 0.3,
        isProxy: false,
      },
      {
        source: 'world_bank',
        code: 'GE.PER.RNK',
        name: 'Government Effectiveness (WGI Percentile)',
        weight: 0.2,
        isProxy: false,
      },
      {
        source: 'world_bank',
        code: 'RL.PER.RNK',
        name: 'Rule of Law (WGI Percentile)',
        weight: 0.15,
        isProxy: false,
      },
      // Heritage (~0.35) — reduced proportionally to make room for WGI
      {
        source: 'heritage',
        code: 'heritage_overall',
        name: 'Economic Freedom Index (overall)',
        weight: 0.14,
      },
      {
        source: 'heritage',
        code: 'heritage_business_freedom',
        name: 'Business Freedom',
        weight: 0.11,
      },
      {
        source: 'heritage',
        code: 'heritage_trade_freedom',
        name: 'Trade Freedom',
        weight: 0.05,
      },
      {
        source: 'heritage',
        code: 'heritage_investment_freedom',
        name: 'Investment Freedom',
        weight: 0.05,
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
  {
    key: 'trajectory',
    label: 'Trajectory',
    description:
      'Composite momentum score derived from trend direction and rate across all other dimensions',
    indicators: [],
    isComposite: true,
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
  key: IndustryVerticalKey;
  label: string;
  weights: DimensionWeights;
}

/**
 * Industry vertical weight profiles for on-the-fly overall MVI recomputation.
 * COUPLING: TypeScript vertical keys/labels now live in @gexis/gexis-core (verticals.ts).
 * Weights remain here. Keep in sync with server/workers/scoring_config.py INDUSTRY_VERTICALS.
 * Dimension scores are stored once (equal-weight); overall is reweighted at query time.
 *
 * Trajectory multipliers (relative to avg of the original six):
 *   tech_saas / telecom → 1.3; manufacturing / energy → 0.7; else → 1.0
 */
function withTrajectory(
  weights: Omit<DimensionWeights, 'trajectory'>,
  trajectoryMult: number
): DimensionWeights {
  const values = Object.values(weights);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    ...weights,
    trajectory: Math.round(avg * trajectoryMult * 1000) / 1000,
  };
}

export const INDUSTRY_VERTICALS: IndustryVertical[] = [
  {
    key: 'all',
    label: INDUSTRY_VERTICAL_LABELS['all'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.167,
        talentDensity: 0.167,
        taxEnvironment: 0.167,
        regulatoryEase: 0.167,
        infrastructure: 0.167,
        competitorSaturation: 0.167,
      },
      1.0
    ),
  },
  {
    key: 'tech_saas',
    label: INDUSTRY_VERTICAL_LABELS['tech_saas'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.15,
        talentDensity: 0.25,
        taxEnvironment: 0.15,
        regulatoryEase: 0.1,
        infrastructure: 0.2,
        competitorSaturation: 0.15,
      },
      1.3
    ),
  },
  {
    key: 'financial',
    label: INDUSTRY_VERTICAL_LABELS['financial'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.2,
        talentDensity: 0.15,
        taxEnvironment: 0.2,
        regulatoryEase: 0.25,
        infrastructure: 0.1,
        competitorSaturation: 0.1,
      },
      1.0
    ),
  },
  {
    key: 'manufacturing',
    label: INDUSTRY_VERTICAL_LABELS['manufacturing'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.15,
        talentDensity: 0.1,
        taxEnvironment: 0.15,
        regulatoryEase: 0.2,
        infrastructure: 0.25,
        competitorSaturation: 0.15,
      },
      0.7
    ),
  },
  {
    key: 'healthcare',
    label: INDUSTRY_VERTICAL_LABELS['healthcare'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.2,
        talentDensity: 0.2,
        taxEnvironment: 0.1,
        regulatoryEase: 0.25,
        infrastructure: 0.15,
        competitorSaturation: 0.1,
      },
      1.0
    ),
  },
  {
    key: 'ecommerce',
    label: INDUSTRY_VERTICAL_LABELS['ecommerce'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.25,
        talentDensity: 0.1,
        taxEnvironment: 0.15,
        regulatoryEase: 0.1,
        infrastructure: 0.25,
        competitorSaturation: 0.15,
      },
      1.0
    ),
  },
  {
    key: 'energy',
    label: INDUSTRY_VERTICAL_LABELS['energy'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.15,
        talentDensity: 0.1,
        taxEnvironment: 0.15,
        regulatoryEase: 0.25,
        infrastructure: 0.25,
        competitorSaturation: 0.1,
      },
      0.7
    ),
  },
  {
    key: 'professional',
    label: INDUSTRY_VERTICAL_LABELS['professional'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.15,
        talentDensity: 0.3,
        taxEnvironment: 0.15,
        regulatoryEase: 0.15,
        infrastructure: 0.1,
        competitorSaturation: 0.15,
      },
      1.0
    ),
  },
  {
    key: 'logistics',
    label: INDUSTRY_VERTICAL_LABELS['logistics'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.2,
        talentDensity: 0.05,
        taxEnvironment: 0.15,
        regulatoryEase: 0.15,
        infrastructure: 0.35,
        competitorSaturation: 0.1,
      },
      1.0
    ),
  },
  {
    key: 'telecom',
    label: INDUSTRY_VERTICAL_LABELS['telecom'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.2,
        talentDensity: 0.15,
        taxEnvironment: 0.1,
        regulatoryEase: 0.2,
        infrastructure: 0.25,
        competitorSaturation: 0.1,
      },
      1.3
    ),
  },
  {
    key: 'consumer_goods',
    label: INDUSTRY_VERTICAL_LABELS['consumer_goods'],
    weights: withTrajectory(
      {
        marketSizeAndGrowth: 0.25,
        talentDensity: 0.1,
        taxEnvironment: 0.1,
        regulatoryEase: 0.15,
        infrastructure: 0.2,
        competitorSaturation: 0.2,
      },
      1.0
    ),
  },
];

if (INDUSTRY_VERTICALS.length !== INDUSTRY_VERTICAL_KEYS.length) {
  throw new Error(
    'INDUSTRY_VERTICALS length must match INDUSTRY_VERTICAL_KEYS from gexis-core'
  );
}

export const DEFAULT_VERTICAL = 'all';

const VERTICAL_BY_KEY = new Map<string, IndustryVertical>(
  INDUSTRY_VERTICALS.map((v) => [v.key, v])
);

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
