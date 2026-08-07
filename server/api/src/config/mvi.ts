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

export const DEFAULT_VERTICAL = 'all_industries';
