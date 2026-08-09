/**
 * Engagement request & lifecycle API (Phase 7).
 *
 * POST /api/engagements
 * GET  /api/engagements?role=requester|agent
 * PUT  /api/engagements/:id/respond
 * PUT  /api/engagements/:id/status
 */

import {
  ENGAGEMENT_STATUS_KEYS,
  type AgentEngagement,
  type EngagementStatus,
  type EngagementWithContext,
} from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { createNotification } from '../services/notifications';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENGAGEMENT_STATUS_SET = new Set<string>(ENGAGEMENT_STATUS_KEYS);

const ENGAGEMENT_SELECT = `
  id, agent_id, user_id, status, business_description, expansion_goals,
  timeline, created_at, updated_at
`;

type EngagementRow = {
  id: string;
  agent_id: string;
  user_id: string;
  status: string;
  business_description: string | null;
  expansion_goals: string | null;
  timeline: string | null;
  created_at: Date;
  updated_at: Date;
  agent_name?: string;
  agent_company?: string | null;
  requester_email?: string;
};

function toEngagement(row: EngagementRow): AgentEngagement {
  return {
    id: row.id,
    agentId: row.agent_id,
    userId: row.user_id,
    status: row.status as EngagementStatus,
    businessDescription: row.business_description,
    expansionGoals: row.expansion_goals,
    timeline: row.timeline,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function toEngagementWithContext(row: EngagementRow): EngagementWithContext {
  const base = toEngagement(row);
  const extras: EngagementWithContext = { ...base };
  if (row.agent_name !== undefined) extras.agentName = row.agent_name;
  if (row.agent_company !== undefined) extras.agentCompany = row.agent_company;
  if (row.requester_email !== undefined) {
    extras.requesterEmail = row.requester_email;
  }
  return extras;
}

async function safeNotify(
  input: Parameters<typeof createNotification>[0]
): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[engagements] notification error:', err);
  }
}

function parseOptionalText(
  raw: unknown,
  field: string,
  maxLen?: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: `${field} must be a string` };
  }
  const value = raw.trim();
  if (!value) {
    return { ok: true, value: null };
  }
  if (maxLen != null && value.length > maxLen) {
    return { ok: false, error: `${field} must be at most ${maxLen} characters` };
  }
  return { ok: true, value };
}

/** POST /api/engagements — request an introduction (marketplace tier) */
router.post(
  '/',
  requireAuth,
  requireTier('marketplace'),
  async (req: Request, res: Response) => {
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

      const businessDescription = parseOptionalText(
        body.businessDescription,
        'businessDescription'
      );
      if (!businessDescription.ok) {
        res.status(400).json(apiError(businessDescription.error));
        return;
      }

      const expansionGoals = parseOptionalText(
        body.expansionGoals,
        'expansionGoals'
      );
      if (!expansionGoals.ok) {
        res.status(400).json(apiError(expansionGoals.error));
        return;
      }

      const timeline = parseOptionalText(body.timeline, 'timeline', 50);
      if (!timeline.ok) {
        res.status(400).json(apiError(timeline.error));
        return;
      }

      const agentResult = await pool.query<{
        id: string;
        user_id: string | null;
      }>(`SELECT id, user_id FROM agents WHERE id = $1`, [agentId]);
      if (agentResult.rowCount === 0) {
        res.status(404).json(apiError('agent_not_found'));
        return;
      }

      const agent = agentResult.rows[0];
      if (agent.user_id && agent.user_id === req.user!.id) {
        res.status(400).json(apiError('cannot_engage_self'));
        return;
      }

      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM agent_engagements
         WHERE agent_id = $1 AND user_id = $2
           AND status NOT IN ('declined', 'completed')`,
        [agentId, req.user!.id]
      );
      if ((existing.rowCount ?? 0) > 0) {
        res.status(409).json(apiError('engagement_exists'));
        return;
      }

      const inserted = await pool.query<EngagementRow>(
        `INSERT INTO agent_engagements (
           agent_id, user_id, status,
           business_description, expansion_goals, timeline
         ) VALUES ($1, $2, 'requested', $3, $4, $5)
         RETURNING ${ENGAGEMENT_SELECT}`,
        [
          agentId,
          req.user!.id,
          businessDescription.value,
          expansionGoals.value,
          timeline.value,
        ]
      );

      const engagement = inserted.rows[0];
      res.status(201).json(apiResponse(toEngagement(engagement)));

      if (agent.user_id) {
        void safeNotify({
          userId: agent.user_id,
          type: 'engagement_requested',
          title: 'New introduction request',
          message: 'A business has requested an introduction with you.',
          metadata: {
            engagementId: engagement.id,
            agentId,
            requesterId: req.user!.id,
          },
        });
      }
    } catch (err) {
      console.error('[engagements] create error:', err);
      res.status(500).json(apiError('Internal server error'));
    }
  }
);

/** GET /api/engagements?role=requester|agent */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const role =
      typeof req.query.role === 'string' ? req.query.role.trim() : '';
    if (role !== 'requester' && role !== 'agent') {
      res.status(400).json({
        error: 'role_required',
        message: 'Query parameter role must be "requester" or "agent"',
      });
      return;
    }

    const statusRaw =
      typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (statusRaw && !ENGAGEMENT_STATUS_SET.has(statusRaw)) {
      res.status(400).json(apiError('status is invalid'));
      return;
    }

    if (role === 'requester') {
      const params: unknown[] = [req.user!.id];
      let sql = `
        SELECT e.id, e.agent_id, e.user_id, e.status, e.business_description,
               e.expansion_goals, e.timeline, e.created_at, e.updated_at,
               a.name AS agent_name, a.company AS agent_company
        FROM agent_engagements e
        JOIN agents a ON a.id = e.agent_id
        WHERE e.user_id = $1
      `;
      if (statusRaw) {
        params.push(statusRaw);
        sql += ` AND e.status = $${params.length}`;
      }
      sql += ` ORDER BY e.updated_at DESC`;

      const result = await pool.query<EngagementRow>(sql, params);
      res.json(apiResponse(result.rows.map(toEngagementWithContext)));
      return;
    }

    // role === 'agent'
    const agentResult = await pool.query<{ id: string }>(
      `SELECT id FROM agents WHERE user_id = $1`,
      [req.user!.id]
    );
    if (agentResult.rowCount === 0) {
      res.json(apiResponse([]));
      return;
    }

    const params: unknown[] = [agentResult.rows[0].id];
    let sql = `
      SELECT e.id, e.agent_id, e.user_id, e.status, e.business_description,
             e.expansion_goals, e.timeline, e.created_at, e.updated_at,
             u.email AS requester_email
      FROM agent_engagements e
      JOIN users u ON u.id = e.user_id
      WHERE e.agent_id = $1
    `;
    if (statusRaw) {
      params.push(statusRaw);
      sql += ` AND e.status = $${params.length}`;
    }
    sql += ` ORDER BY e.updated_at DESC`;

    const result = await pool.query<EngagementRow>(sql, params);
    res.json(apiResponse(result.rows.map(toEngagementWithContext)));
  } catch (err) {
    console.error('[engagements] list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** PUT /api/engagements/:id/respond — agent accepts or declines */
router.put('/:id/respond', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!UUID_RE.test(id)) {
      res.status(400).json(apiError('id must be a valid UUID'));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const response =
      typeof body.response === 'string' ? body.response.trim() : '';
    if (response !== 'accepted' && response !== 'declined') {
      res
        .status(400)
        .json(apiError('response must be "accepted" or "declined"'));
      return;
    }

    const existing = await pool.query<EngagementRow>(
      `SELECT ${ENGAGEMENT_SELECT}
       FROM agent_engagements
       WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      res.status(404).json(apiError('engagement_not_found'));
      return;
    }

    const engagement = existing.rows[0];
    if (engagement.status !== 'requested') {
      res.status(400).json({
        error: 'invalid_status_transition',
        message: 'Can only respond to engagements with status "requested"',
      });
      return;
    }

    const owner = await pool.query<{ user_id: string | null }>(
      `SELECT user_id FROM agents WHERE id = $1`,
      [engagement.agent_id]
    );
    if (
      owner.rowCount === 0 ||
      !owner.rows[0].user_id ||
      owner.rows[0].user_id !== req.user!.id
    ) {
      res.status(403).json(apiError('not_agent_owner'));
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<EngagementRow>(
        `UPDATE agent_engagements
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING ${ENGAGEMENT_SELECT}`,
        [response, id]
      );

      if (response === 'accepted') {
        await client.query(
          `UPDATE agents
           SET engagement_count = engagement_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [engagement.agent_id]
        );
      }

      await client.query('COMMIT');
      res.json(apiResponse(toEngagement(updated.rows[0])));

      void safeNotify({
        userId: engagement.user_id,
        type:
          response === 'accepted'
            ? 'engagement_accepted'
            : 'engagement_declined',
        title:
          response === 'accepted'
            ? 'Introduction accepted'
            : 'Introduction declined',
        message:
          response === 'accepted'
            ? 'An agent has accepted your introduction request.'
            : 'An agent has declined your introduction request.',
        metadata: {
          engagementId: engagement.id,
          agentId: engagement.agent_id,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[engagements] respond error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** PUT /api/engagements/:id/status — advance accepted→active→completed */
router.put('/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!UUID_RE.test(id)) {
      res.status(400).json(apiError('id must be a valid UUID'));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const nextStatus =
      typeof body.status === 'string' ? body.status.trim() : '';
    if (nextStatus !== 'active' && nextStatus !== 'completed') {
      res.status(400).json(apiError('status must be "active" or "completed"'));
      return;
    }

    const existing = await pool.query<EngagementRow>(
      `SELECT ${ENGAGEMENT_SELECT}
       FROM agent_engagements
       WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      res.status(404).json(apiError('engagement_not_found'));
      return;
    }

    const engagement = existing.rows[0];
    const current = engagement.status;

    const allowed =
      (current === 'accepted' && nextStatus === 'active') ||
      (current === 'active' && nextStatus === 'completed');

    if (!allowed) {
      res.status(400).json({
        error: 'invalid_status_transition',
        message: `Cannot transition from "${current}" to "${nextStatus}"`,
      });
      return;
    }

    const owner = await pool.query<{ user_id: string | null }>(
      `SELECT user_id FROM agents WHERE id = $1`,
      [engagement.agent_id]
    );
    const agentUserId = owner.rows[0]?.user_id ?? null;
    const isRequester = engagement.user_id === req.user!.id;
    const isAgent = agentUserId != null && agentUserId === req.user!.id;

    if (!isRequester && !isAgent) {
      res.status(403).json(apiError('not_participant'));
      return;
    }

    const updated = await pool.query<EngagementRow>(
      `UPDATE agent_engagements
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${ENGAGEMENT_SELECT}`,
      [nextStatus, id]
    );

    res.json(apiResponse(toEngagement(updated.rows[0])));

    const actingUserId = req.user!.id;
    const requesterUserId = engagement.user_id;
    const recipientUserId =
      actingUserId === requesterUserId ? agentUserId : requesterUserId;

    if (recipientUserId) {
      void safeNotify({
        userId: recipientUserId,
        type:
          nextStatus === 'active'
            ? 'engagement_active'
            : 'engagement_completed',
        title:
          nextStatus === 'active'
            ? 'Engagement is now active'
            : 'Engagement completed',
        message:
          nextStatus === 'active'
            ? 'Your engagement has been marked as active.'
            : 'Your engagement has been marked as complete. Consider leaving a review.',
        metadata: {
          engagementId: engagement.id,
          agentId: engagement.agent_id,
        },
      });
    }
  } catch (err) {
    console.error('[engagements] status error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
