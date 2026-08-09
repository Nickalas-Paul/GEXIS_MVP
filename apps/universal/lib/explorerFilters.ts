import type { GeographyFilters } from '@/services/geographies';
import { DEFAULT_INDUSTRY_VERTICAL } from '@/lib/industryVerticals';

export type TimeHorizon = 'current' | '2yr' | '5yr';

export type ExplorerFilterState = {
  industryVertical: string;
  horizon: TimeHorizon;
  minPopulation: number;
  maxCorpTaxRate: number;
  minTalentDensity: number;
  maxCompetitorSaturation: number;
  minRegulatoryEase: number;
};

export const DEFAULT_FILTERS: ExplorerFilterState = {
  industryVertical: DEFAULT_INDUSTRY_VERTICAL,
  horizon: 'current',
  minPopulation: 0,
  maxCorpTaxRate: 50,
  minTalentDensity: 0,
  maxCompetitorSaturation: 100,
  minRegulatoryEase: 0,
};

export const FILTER_LIMITS = {
  minPopulation: { min: 0, max: 100_000_000, step: 1_000_000 },
  maxCorpTaxRate: { min: 0, max: 50, step: 1 },
  minTalentDensity: { min: 0, max: 100, step: 1 },
  maxCompetitorSaturation: { min: 0, max: 100, step: 1 },
  minRegulatoryEase: { min: 0, max: 100, step: 1 },
} as const;

export function formatPopulation(value: number): string {
  if (value <= 0) return '≥ 0';
  if (value >= 1_000_000_000) return `≥ ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `≥ ${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (value >= 1_000) return `≥ ${Math.round(value / 1_000)}K`;
  return `≥ ${value}`;
}

export function formatPercentCap(value: number): string {
  return `≤ ${value}%`;
}

export function formatMinScore(value: number): string {
  return `≥ ${value}`;
}

export function formatMaxScore(value: number): string {
  return `≤ ${value}%`;
}

/** Convert UI state to API filter body (omit inactive defaults). */
export function toApiFilters(state: ExplorerFilterState): GeographyFilters {
  const filters: GeographyFilters = {};
  if (state.minPopulation > 0) filters.minPopulation = state.minPopulation;
  if (state.maxCorpTaxRate < FILTER_LIMITS.maxCorpTaxRate.max) {
    filters.maxCorpTaxRate = state.maxCorpTaxRate;
  }
  if (state.minTalentDensity > 0) filters.minTalentDensity = state.minTalentDensity;
  if (state.maxCompetitorSaturation < 100) {
    filters.maxCompetitorSaturation = state.maxCompetitorSaturation;
  }
  if (state.minRegulatoryEase > 0) filters.minRegulatoryEase = state.minRegulatoryEase;
  return filters;
}

export function filtersEqual(a: ExplorerFilterState, b: ExplorerFilterState): boolean {
  return (
    a.industryVertical === b.industryVertical &&
    a.horizon === b.horizon &&
    a.minPopulation === b.minPopulation &&
    a.maxCorpTaxRate === b.maxCorpTaxRate &&
    a.minTalentDensity === b.minTalentDensity &&
    a.maxCompetitorSaturation === b.maxCompetitorSaturation &&
    a.minRegulatoryEase === b.minRegulatoryEase
  );
}

export function parseFiltersFromParams(
  params: Record<string, string | string[] | undefined>
): ExplorerFilterState {
  const one = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (key: string, fallback: number): number => {
    const raw = one(key);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  const horizonRaw = one('horizon');
  const horizon: TimeHorizon =
    horizonRaw === '2yr' || horizonRaw === '5yr' ? horizonRaw : 'current';

  return {
    industryVertical:
      one('vertical') === 'all_industries'
        ? DEFAULT_FILTERS.industryVertical
        : one('vertical') || DEFAULT_FILTERS.industryVertical,
    horizon,
    minPopulation: num('minPopulation', DEFAULT_FILTERS.minPopulation),
    maxCorpTaxRate: num('maxCorpTaxRate', DEFAULT_FILTERS.maxCorpTaxRate),
    minTalentDensity: num('minTalentDensity', DEFAULT_FILTERS.minTalentDensity),
    maxCompetitorSaturation: num(
      'maxCompetitorSaturation',
      DEFAULT_FILTERS.maxCompetitorSaturation
    ),
    minRegulatoryEase: num('minRegulatoryEase', DEFAULT_FILTERS.minRegulatoryEase),
  };
}

export function filtersToQueryRecord(
  state: ExplorerFilterState
): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.industryVertical !== DEFAULT_FILTERS.industryVertical) {
    out.vertical = state.industryVertical;
  }
  if (state.horizon !== DEFAULT_FILTERS.horizon) {
    out.horizon = state.horizon;
  }
  if (state.minPopulation !== DEFAULT_FILTERS.minPopulation) {
    out.minPopulation = String(state.minPopulation);
  }
  if (state.maxCorpTaxRate !== DEFAULT_FILTERS.maxCorpTaxRate) {
    out.maxCorpTaxRate = String(state.maxCorpTaxRate);
  }
  if (state.minTalentDensity !== DEFAULT_FILTERS.minTalentDensity) {
    out.minTalentDensity = String(state.minTalentDensity);
  }
  if (state.maxCompetitorSaturation !== DEFAULT_FILTERS.maxCompetitorSaturation) {
    out.maxCompetitorSaturation = String(state.maxCompetitorSaturation);
  }
  if (state.minRegulatoryEase !== DEFAULT_FILTERS.minRegulatoryEase) {
    out.minRegulatoryEase = String(state.minRegulatoryEase);
  }
  return out;
}

/** Portable JSONB shape stored in saved_searches.filters. */
export type SavedFilterPayload = {
  population?: number;
  maxCorpTaxRate?: number;
  regulatoryEase?: number;
  talentDensity?: number;
  competitorSaturation?: number;
  vertical?: string;
  horizon?: TimeHorizon | string;
  // Also accept explorer-native keys for forward compatibility.
  minPopulation?: number;
  minTalentDensity?: number;
  maxCompetitorSaturation?: number;
  minRegulatoryEase?: number;
  industryVertical?: string;
};

export function stateToSavedFilters(
  state: ExplorerFilterState
): SavedFilterPayload {
  return {
    population: state.minPopulation,
    maxCorpTaxRate: state.maxCorpTaxRate,
    regulatoryEase: state.minRegulatoryEase,
    talentDensity: state.minTalentDensity,
    competitorSaturation: state.maxCompetitorSaturation,
    vertical: state.industryVertical,
    horizon: state.horizon,
  };
}

function numField(
  raw: SavedFilterPayload,
  keys: Array<keyof SavedFilterPayload>,
  fallback: number
): number {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

export function savedFiltersToState(
  raw: Record<string, unknown> | null | undefined
): ExplorerFilterState {
  const f = (raw ?? {}) as SavedFilterPayload;
  const horizonRaw = f.horizon;
  const horizon: TimeHorizon =
    horizonRaw === '2yr' || horizonRaw === '5yr' ? horizonRaw : 'current';

  const vertical =
    (typeof f.vertical === 'string' && f.vertical) ||
    (typeof f.industryVertical === 'string' && f.industryVertical) ||
    DEFAULT_FILTERS.industryVertical;

  return {
    industryVertical: vertical === 'all_industries' ? DEFAULT_INDUSTRY_VERTICAL : vertical,
    horizon,
    minPopulation: numField(f, ['population', 'minPopulation'], DEFAULT_FILTERS.minPopulation),
    maxCorpTaxRate: numField(
      f,
      ['maxCorpTaxRate'],
      DEFAULT_FILTERS.maxCorpTaxRate
    ),
    minTalentDensity: numField(
      f,
      ['talentDensity', 'minTalentDensity'],
      DEFAULT_FILTERS.minTalentDensity
    ),
    maxCompetitorSaturation: numField(
      f,
      ['competitorSaturation', 'maxCompetitorSaturation'],
      DEFAULT_FILTERS.maxCompetitorSaturation
    ),
    minRegulatoryEase: numField(
      f,
      ['regulatoryEase', 'minRegulatoryEase'],
      DEFAULT_FILTERS.minRegulatoryEase
    ),
  };
}
