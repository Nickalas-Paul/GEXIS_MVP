import {
  canAccessFeature,
  canUseFilter as coreCanUseFilter,
  canUseHorizon as coreCanUseHorizon,
  getAvailableFilters as coreGetAvailableFilters,
  isGatingEnabled,
  type FilterKey,
  type SubscriptionTier,
} from '@gexis/gexis-core';

import { useAuth } from '@/services/auth';

function normalizeTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === 'free' || raw === 'pro' || raw === 'marketplace') {
    return raw;
  }
  return 'free';
}

export type TierAccess = {
  gatingEnabled: boolean;
  currentTier: SubscriptionTier;
  canUseFilter: (filterKey: string) => boolean;
  canUseHorizon: (horizon: string) => boolean;
  canExport: () => boolean;
  canSaveSearches: () => boolean;
  canAccessAgentIntros: () => boolean;
  canUseIndustryVertical: () => boolean;
  getAvailableFilters: () => FilterKey[];
};

/**
 * Client-side tier + feature access.
 * When gating is off (beta default), all access checks return true.
 */
export function useTierAccess(): TierAccess {
  const { user } = useAuth();
  const gatingEnabled = isGatingEnabled();
  const currentTier = normalizeTier(user?.subscriptionTier);

  return {
    gatingEnabled,
    currentTier,
    canUseFilter: (filterKey: string) => coreCanUseFilter(currentTier, filterKey),
    canUseHorizon: (horizon: string) => coreCanUseHorizon(currentTier, horizon),
    canExport: () => canAccessFeature(currentTier, 'exports'),
    canSaveSearches: () => canAccessFeature(currentTier, 'savedSearches'),
    canAccessAgentIntros: () =>
      canAccessFeature(currentTier, 'agentIntroductions'),
    canUseIndustryVertical: () =>
      canAccessFeature(currentTier, 'industryVertical'),
    getAvailableFilters: () => coreGetAvailableFilters(currentTier),
  };
}