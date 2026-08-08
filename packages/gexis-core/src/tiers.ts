/**
 * Subscription tiers and feature gating (Phase 6).
 *
 * Gating is OFF by default for beta. Set GEXIS_GATING_ENABLED=true to enforce.
 */

export type SubscriptionTier = 'free' | 'pro' | 'marketplace';

/** Filter dimension keys (5 total; Free unlocks 3). */
export type FilterKey =
  | 'population'
  | 'maxCorpTaxRate'
  | 'regulatoryEase'
  | 'talentDensity'
  | 'competitorSaturation';

export type TimeHorizon = 'current' | '2yr' | '5yr';

/** Named product features gated by tier. */
export type TierFeature =
  | 'exports'
  | 'savedSearches'
  | 'agentIntroductions'
  | 'trendAnalysis'
  | 'timeHorizon'
  | 'industryVertical';

export const FREE_FILTER_KEYS: readonly FilterKey[] = [
  'population',
  'maxCorpTaxRate',
  'regulatoryEase',
] as const;

export const ALL_FILTER_KEYS: readonly FilterKey[] = [
  'population',
  'maxCorpTaxRate',
  'regulatoryEase',
  'talentDensity',
  'competitorSaturation',
] as const;

export const ALL_HORIZONS: readonly TimeHorizon[] = [
  'current',
  '2yr',
  '5yr',
] as const;

export type TierFeatureMap = {
  filterKeys: readonly FilterKey[];
  horizons: readonly TimeHorizon[];
  /** When false, industry vertical is locked to All Industries. */
  industryVertical: boolean;
  exports: boolean;
  savedSearches: boolean;
  agentIntroductions: boolean;
  trendAnalysis: boolean;
  /** When true, 2yr/5yr horizons are available (in addition to current). */
  timeHorizon: boolean;
};

/** What each tier unlocks when gating is enabled. */
export const TIER_FEATURES: Record<SubscriptionTier, TierFeatureMap> = {
  free: {
    filterKeys: FREE_FILTER_KEYS,
    horizons: ['current'],
    industryVertical: false,
    exports: false,
    savedSearches: false,
    agentIntroductions: false,
    trendAnalysis: false,
    timeHorizon: false,
  },
  pro: {
    filterKeys: ALL_FILTER_KEYS,
    horizons: ALL_HORIZONS,
    industryVertical: true,
    exports: true,
    savedSearches: true,
    agentIntroductions: false,
    trendAnalysis: true,
    timeHorizon: true,
  },
  marketplace: {
    filterKeys: ALL_FILTER_KEYS,
    horizons: ALL_HORIZONS,
    industryVertical: true,
    exports: true,
    savedSearches: true,
    agentIntroductions: true,
    trendAnalysis: true,
    timeHorizon: true,
  },
};

/**
 * Reads GEXIS_GATING_ENABLED from the environment.
 * Defaults to false (gating off for beta). True only for "true" or "1".
 */
export function isGatingEnabled(): boolean {
  if (typeof process === 'undefined' || process.env == null) {
    return false;
  }
  const raw = process.env.GEXIS_GATING_ENABLED;
  return raw === 'true' || raw === '1';
}

/**
 * Live gating flag. Prefer isGatingEnabled() so env changes are respected
 * without re-importing the module.
 */
export const GATING_ENABLED = {
  get value(): boolean {
    return isGatingEnabled();
  },
  valueOf(): boolean {
    return isGatingEnabled();
  },
  [Symbol.toPrimitive](): boolean {
    return isGatingEnabled();
  },
};

function normalizeTier(tier: string): SubscriptionTier {
  if (tier === 'free' || tier === 'pro' || tier === 'marketplace') {
    return tier;
  }
  return 'free';
}

export function canAccessFeature(
  tier: SubscriptionTier | string,
  feature: TierFeature
): boolean {
  if (!isGatingEnabled()) {
    return true;
  }
  const map = TIER_FEATURES[normalizeTier(tier)];
  return Boolean(map[feature]);
}

export function canUseFilter(
  tier: SubscriptionTier | string,
  filterKey: FilterKey | string
): boolean {
  if (!isGatingEnabled()) {
    return true;
  }
  const map = TIER_FEATURES[normalizeTier(tier)];
  return (map.filterKeys as readonly string[]).includes(filterKey);
}

export function canUseHorizon(
  tier: SubscriptionTier | string,
  horizon: TimeHorizon | string
): boolean {
  if (!isGatingEnabled()) {
    return true;
  }
  const map = TIER_FEATURES[normalizeTier(tier)];
  return (map.horizons as readonly string[]).includes(horizon);
}

export function getAvailableFilters(
  tier: SubscriptionTier | string
): FilterKey[] {
  if (!isGatingEnabled()) {
    return [...ALL_FILTER_KEYS];
  }
  return [...TIER_FEATURES[normalizeTier(tier)].filterKeys];
}
