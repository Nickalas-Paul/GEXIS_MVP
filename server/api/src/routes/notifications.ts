/**
 * In-app notifications API (Phase 7 Step 10).
 *
 * GET  /api/notifications
 * GET  /api/notifications/unread-count
 * PUT  /api/notifications/read-all
 * PUT  /api/notifications/:id/read
 */

import {
  type AppNotification,
  type NotificationType,
} from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    read: row.read,
    metadata: row.metadata,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

const NOTIFICATION_SELECT = `
  id, user_id, type, title, message, read, metadata, created_at
`;

/** GET /api/notifications — list for authenticated user */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query<NotificationRow>(
      `SELECT ${NOTIFICATION_SELECT}
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.id]
    );
    res.json(apiResponse(result.rows.map(toNotification)));
  } catch (err) {
    console.error('[notifications] list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** GET /api/notifications/unread-count */
router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1 AND read = false`,
      [req.user!.id]
    );
    res.json(apiResponse({ count: result.rows[0]?.count ?? 0 }));
  } catch (err) {
    console.error('[notifications] unread-count error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** PUT /api/notifications/read-all — must be registered before /:id/read */
router.put('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET read = true
       WHERE user_id = $1 AND read = false`,
      [req.user!.id]
    );
    res.json(apiResponse({ updated: result.rowCount ?? 0 }));
  } catch (err) {
    console.error('[notifications] read-all error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** PUT /api/notifications/:id/read */
router.put('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!UUID_RE.test(id)) {
      res.status(400).json(apiError('id must be a valid UUID'));
      return;
    }

    const result = await pool.query<NotificationRow>(
      `UPDATE notifications SET read = true
       WHERE id = $1 AND user_id = $2
       RETURNING ${NOTIFICATION_SELECT}`,
      [id, req.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json(apiError('notification_not_found'));
      return;
    }

    res.json(apiResponse(toNotification(result.rows[0])));
  } catch (err) {
    console.error('[notifications] mark-read error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
