import {
  canAccessFeature,
  isGatingEnabled,
  type SubscriptionTier,
} from '@gexis/gexis-core';
import { Request, Response, NextFunction } from 'express';

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  marketplace: 2,
};

function normalizeTier(raw: string | undefined): SubscriptionTier {
  if (raw === 'free' || raw === 'pro' || raw === 'marketplace') {
    return raw;
  }
  return 'free';
}

/**
 * When gating is OFF: pass through (no auth / tier check).
 * When gating is ON: require req.user and subscriptionTier >= minimumTier.
 *
 * canAccessFeature is re-exported for callers that need feature-level checks
 * alongside this middleware.
 */
export { canAccessFeature };

export function requireTier(minimumTier: SubscriptionTier) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isGatingEnabled()) {
      next();
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const currentTier = normalizeTier(req.user.subscriptionTier);
    if (TIER_RANK[currentTier] < TIER_RANK[minimumTier]) {
      res.status(403).json({
        error: 'upgrade_required',
        requiredTier: minimumTier,
        currentTier,
      });
      return;
    }

    next();
  };
}