/**
 * Server-side notification creation helper (Phase 7 Step 10).
 * Called by route handlers — not an HTTP route itself.
 */

import { pool } from '../config/database';

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

/** Insert a notification row. Errors are logged by callers (never throw upward). */
export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.userId,
      input.type,
      input.title,
      input.message ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
}
