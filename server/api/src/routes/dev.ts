/**
 * Dev-only utilities. Not registered in production.
 *
 * POST /api/dev/set-tier  { tier: 'free' | 'pro' | 'marketplace' }
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { getCurrentUser } from '../services/auth.service';
import { apiError } from '../utils/response';

const router = Router();

const ALLOWED_TIERS = new Set(['free', 'pro', 'marketplace']);

router.post('/set-tier', requireAuth, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json(apiError('Not found'));
    return;
  }

  try {
    const tier = String((req.body ?? {}).tier ?? '').trim();
    if (!ALLOWED_TIERS.has(tier)) {
      res
        .status(400)
        .json(apiError("tier must be one of: free, pro, marketplace"));
      return;
    }

    const result = await pool.query(
      `UPDATE users
       SET subscription_tier = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [tier, req.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json(apiError('User not found'));
      return;
    }

    const user = await getCurrentUser(req.user!.id);
    res.json({ user });
  } catch (err) {
    console.error('[dev] set-tier error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;