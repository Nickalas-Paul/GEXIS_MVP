/**
 * User shortlist CRUD (Phase 7).
 *
 * GET    /api/shortlist
 * POST   /api/shortlist
 * DELETE /api/shortlist/:agentId
 */

import {
  type AgentCategory,
  type ResponseTime,
  type ShortlistEntry,
} from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ShortlistItem = ShortlistEntry & {
  name: string;
  company: string | null;
  category: AgentCategory;
  customCategory: string | null;
  verified: boolean;
  rating: number;
  engagementCount: number;
  responseTime: ResponseTime | null;
  industryVerticals: string[];
  domainTags: string[];
};

type ShortlistJoinRow = {
  id: string;
  user_id: string;
  agent_id: string;
  created_at: Date;
  name: string;
  company: string | null;
  category: string;
  custom_category: string | null;
  verified: boolean;
  rating: string | number | null;
  engagement_count: number;
  response_time: string | null;
  industry_verticals: string[] | null;
  domain_tags: string[] | null;
};

function toShortlistItem(row: ShortlistJoinRow): ShortlistItem {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    name: row.name,
    company: row.company,
    category: row.category as AgentCategory,
    customCategory: row.custom_category,
    verified: row.verified,
    rating: row.rating == null ? 0 : Number(row.rating),
    engagementCount: row.engagement_count,
    responseTime: (row.response_time as ResponseTime | null) ?? null,
    industryVerticals: row.industry_verticals ?? [],
    domainTags: row.domain_tags ?? [],
  };
}

const SHORTLIST_JOIN_SELECT = `
  SELECT s.id, s.user_id, s.agent_id, s.created_at,
         a.name, a.company, a.category, a.custom_category, a.verified,
         a.rating, a.engagement_count, a.response_time,
         a.industry_verticals, a.domain_tags
  FROM user_shortlists s
  JOIN agents a ON a.id = s.agent_id
`;

/** GET /api/shortlist — list authenticated user's shortlisted agents */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query<ShortlistJoinRow>(
      `${SHORTLIST_JOIN_SELECT}
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user!.id]
    );
    res.json(apiResponse(result.rows.map(toShortlistItem)));
  } catch (err) {
    console.error('[shortlist] list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** POST /api/shortlist — add agent to shortlist */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.agentId !== 'string' || !body.agentId.trim()) {
      res.status(400).json(apiError('agentId is required'));
      return;
    }
    const agentId = body.agentId.trim();
    if (!UUID_RE.test(agentId)) {
      res.status(400).json(apiError('agentId must be a valid UUID'));
      return;
    }

    const agentExists = await pool.query<{ id: string }>(
      `SELECT id FROM agents WHERE id = $1`,
      [agentId]
    );
    if (agentExists.rowCount === 0) {
      res.status(404).json(apiError('agent_not_found'));
      return;
    }

    try {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO user_shortlists (user_id, agent_id)
         VALUES ($1, $2)
         RETURNING id`,
        [req.user!.id, agentId]
      );

      const result = await pool.query<ShortlistJoinRow>(
        `${SHORTLIST_JOIN_SELECT}
         WHERE s.id = $1`,
        [inserted.rows[0].id]
      );

      res.status(201).json(apiResponse(toShortlistItem(result.rows[0])));
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        res.status(409).json(apiError('already_shortlisted'));
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error('[shortlist] create error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** DELETE /api/shortlist/:agentId — remove agent from shortlist */
router.delete('/:agentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const agentId = String(req.params.agentId ?? '').trim();
    if (!UUID_RE.test(agentId)) {
      res.status(400).json(apiError('agentId must be a valid UUID'));
      return;
    }

    const result = await pool.query(
      `DELETE FROM user_shortlists
       WHERE user_id = $1 AND agent_id = $2`,
      [req.user!.id, agentId]
    );

    if (result.rowCount === 0) {
      res.status(404).json(apiError('not_in_shortlist'));
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error('[shortlist] delete error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
