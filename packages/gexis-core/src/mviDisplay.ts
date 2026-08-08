/**
 * Client-facing MVI display metadata.
 * Keep labels/descriptions aligned with server/api/src/config/mvi.ts.
 */

export type DimensionKey =
  | 'marketSizeAndGrowth'
  | 'talentDensity'
  | 'taxEnvironment'
  | 'regulatoryEase'
  | 'infrastructure'
  | 'competitorSaturation';

export type DimensionDisplay = {
  key: DimensionKey;
  label: string;
  description: string;
  /** Indicator codes that belong to this dimension (for source filtering). */
  indicatorCodes: string[];
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
  },
  {
    key: 'talentDensity',
    label: 'Talent Density',
    description: 'Tertiary education attainment and skilled workforce density',
    indicatorCodes: ['oecd_tertiary_attainment'],
  },
  {
    key: 'taxEnvironment',
    label: 'Tax Environment',
    description: 'Corporate tax competitiveness for market entry',
    indicatorCodes: ['corp_tax_rate'],
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
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    description: 'Digital connectivity and logistics performance',
    indicatorCodes: ['IT.NET.USER.ZS', 'LP.LPI.OVRL.XQ'],
  },
  {
    key: 'competitorSaturation',
    label: 'Competitor Saturation',
    description: 'New business formation intensity as a market-activity proxy',
    indicatorCodes: ['IC.BUS.NDNS.ZS'],
  },
];

/** Short source labels for pills on the detail page. */
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  world_bank: 'World Bank',
  imf_weo: 'IMF WEO',
  heritage: 'Heritage Foundation',
  tax_foundation: 'Tax Foundation',
  oecd: 'OECD',
};

export function sourceDisplayName(sourceKey: string): string {
  return SOURCE_DISPLAY_NAMES[sourceKey] ?? sourceKey;
}

export function getDimensionDisplay(key: string): DimensionDisplay | undefined {
  return MVI_DIMENSION_DISPLAY.find((d) => d.key === key);
}
