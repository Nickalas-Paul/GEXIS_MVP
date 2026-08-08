import {
  FREE_FILTER_KEYS,
  canUseFilter,
  canUseHorizon,
  isGatingEnabled,
  type FilterKey,
  type SubscriptionTier,
} from '@gexis/gexis-core';
import { Request, Response, NextFunction } from 'express';

/** Map API body / nested filter field names onto canonical FilterKey values. */
const BODY_KEY_TO_FILTER: Record<string, FilterKey> = {
  population: 'population',
  minPopulation: 'population',
  maxCorpTaxRate: 'maxCorpTaxRate',
  regulatoryEase: 'regulatoryEase',
  minRegulatoryEase: 'regulatoryEase',
  talentDensity: 'talentDensity',
  minTalentDensity: 'talentDensity',
  competitorSaturation: 'competitorSaturation',
  maxCompetitorSaturation: 'competitorSaturation',
};

function normalizeTier(raw: string | undefined): SubscriptionTier {
  if (raw === 'free' || raw === 'pro' || raw === 'marketplace') {
    return raw;
  }
  return 'free';
}

function isAllowedFilterKey(tier: SubscriptionTier, key: string): boolean {
  const mapped = BODY_KEY_TO_FILTER[key];
  if (!mapped) {
    return false;
  }
  if ((FREE_FILTER_KEYS as readonly FilterKey[]).includes(mapped)) {
    return true;
  }
  return canUseFilter(tier, mapped);
}

function stripDisallowedFilters(
  filters: Record<string, unknown>,
  tier: SubscriptionTier
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (isAllowedFilterKey(tier, key)) {
      next[key] = value;
    }
  }
  return next;
}

/**
 * When gating is OFF: pass through.
 * When gating is ON and the user is free (or unauthenticated):
 * strip filter keys not in FREE_FILTER_KEYS and force horizon to current.
 * Pro and marketplace: unchanged.
 */
export function requireFilterAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!isGatingEnabled()) {
    next();
    return;
  }

  const tier = normalizeTier(req.user?.subscriptionTier);
  if (tier === 'pro' || tier === 'marketplace') {
    next();
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) {
    body.filters = stripDisallowedFilters(
      body.filters as Record<string, unknown>,
      tier
    );
  }

  for (const key of [...Object.keys(body)]) {
    if (
      key === 'filters' ||
      key === 'vertical' ||
      key === 'sort' ||
      key === 'limit' ||
      key === 'horizon'
    ) {
      continue;
    }
    if (BODY_KEY_TO_FILTER[key]) {
      if (!isAllowedFilterKey(tier, key)) {
        delete body[key];
      }
      continue;
    }
    if (key.startsWith('min') || key.startsWith('max')) {
      delete body[key];
    }
  }

  const horizonRaw = body.horizon;
  if (
    horizonRaw !== undefined &&
    horizonRaw !== null &&
    horizonRaw !== '' &&
    !canUseHorizon(tier, String(horizonRaw))
  ) {
    // API treats absent horizon as current; 'current' is not a valid parseHorizon value.
    delete body.horizon;
  }

  req.body = body;
  next();
}