/**
 * Market signals routes (public Layer 2 data).
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { createNotification } from '../services/notifications';
import { apiError, apiResponse, toCamelCase } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseActive(raw: unknown): boolean {
  if (raw == null || raw === '') return true;
  if (typeof raw !== 'string') return true;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, 100);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const geographyRaw = req.query.geographyId;
    if (typeof geographyRaw !== 'string' || !geographyRaw.trim()) {
      res.status(400).json(apiError('geographyId is required (UUID or ISO3)'));
      return;
    }

    const geographyId = geographyRaw.trim();
    const isIso = !UUID_RE.test(geographyId);
    const activeOnly = parseActive(req.query.active);
    const limit = parseLimit(req.query.limit);

    const geoResult = await pool.query<{ id: string; iso_code: string | null }>(
      `
      SELECT id, iso_code
      FROM geographies
      WHERE region_type = 'country'
        AND ${isIso ? 'upper(iso_code) = upper($1)' : 'id = $1::uuid'}
      LIMIT 1
      `,
      [geographyId]
    );

    if (geoResult.rows.length === 0) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }

    const geo = geoResult.rows[0];

    const activeClause = activeOnly
      ? `AND resolved = false AND (expires_at IS NULL OR expires_at > NOW())`
      : '';

    const signalsResult = await pool.query(
      `
      SELECT
        id,
        source,
        signal_type,
        title,
        description,
        probability,
        severity,
        direction,
        affected_dimensions,
        event_url,
        fetched_at,
        expires_at
      FROM market_signals
      WHERE geography_id = $1
      ${activeClause}
      ORDER BY severity DESC NULLS LAST, probability DESC NULLS LAST, fetched_at DESC
      LIMIT $2
      `,
      [geo.id, limit]
    );

    const signals = signalsResult.rows.map((row) => {
      const camel = toCamelCase(row as Record<string, unknown>);
      // Ensure numeric JSON types for probability/severity
      if (camel.probability != null) {
        camel.probability = Number(camel.probability);
      }
      if (camel.severity != null) {
        camel.severity = Number(camel.severity);
      }
      return camel;
    });

    res.json({
      success: true,
      ...apiResponse({
        signals,
        count: signals.length,
        geographyId: geo.id,
        isoCode: geo.iso_code,
      }),
    });
  } catch (err) {
    console.error('[signals] list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/**
 * GET /api/signals/summary
 * Active signal counts keyed by geography ISO3 (only geos with ≥1).
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<{ iso_code: string; count: string }>(
      `
      SELECT upper(g.iso_code) AS iso_code, COUNT(*)::int AS count
      FROM market_signals ms
      INNER JOIN geographies g ON g.id = ms.geography_id
      WHERE ms.resolved = false
        AND (ms.expires_at IS NULL OR ms.expires_at > NOW())
        AND g.iso_code IS NOT NULL
        AND g.region_type = 'country'
      GROUP BY upper(g.iso_code)
      HAVING COUNT(*) > 0
      `
    );

    const summary: Record<string, number> = {};
    for (const row of result.rows) {
      summary[row.iso_code] = Number(row.count);
    }

    res.json({
      success: true,
      ...apiResponse(summary),
    });
  } catch (err) {
    console.error('[signals] summary error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/**
 * POST /api/signals/process-notifications
 * Internal hook: notify verified agents covering geographies with recent signals.
 */
router.post('/process-notifications', async (_req: Request, res: Response) => {
  try {
    const signalsResult = await pool.query<{
      id: string;
      geography_id: string;
      signal_type: string;
      direction: string;
      title: string;
      country_name: string | null;
    }>(
      `
      SELECT
        ms.id,
        ms.geography_id,
        ms.signal_type,
        ms.direction,
        ms.title,
        g.name AS country_name
      FROM market_signals ms
      INNER JOIN geographies g ON g.id = ms.geography_id
      WHERE ms.resolved = false
        AND ms.created_at > NOW() - INTERVAL '24 hours'
        AND ms.geography_id IS NOT NULL
      ORDER BY ms.created_at DESC
      `
    );

    const signals = signalsResult.rows;
    let notificationsCreated = 0;

    for (const signal of signals) {
      const agentsResult = await pool.query<{ user_id: string }>(
        `
        SELECT DISTINCT user_id
        FROM agents
        WHERE verified = true
          AND geography_ids IS NOT NULL
          AND $1::uuid = ANY(geography_ids)
        `,
        [signal.geography_id]
      );

      const countryName = signal.country_name?.trim() || 'your coverage area';
      const message =
        signal.title.length > 200
          ? `${signal.title.slice(0, 197)}...`
          : signal.title;

      for (const agent of agentsResult.rows) {
        const existing = await pool.query(
          `
          SELECT 1
          FROM notifications
          WHERE user_id = $1
            AND type = 'market_event'
            AND metadata->>'signalId' = $2
          LIMIT 1
          `,
          [agent.user_id, signal.id]
        );
        if (existing.rows.length > 0) {
          continue;
        }

        try {
          await createNotification({
            userId: agent.user_id,
            type: 'market_event',
            title: `Market event in ${countryName}`,
            message,
            metadata: {
              signalId: signal.id,
              geographyId: signal.geography_id,
              signalType: signal.signal_type,
              direction: signal.direction,
            },
          });
          notificationsCreated += 1;
        } catch (err) {
          console.error(
            '[signals] createNotification failed:',
            signal.id,
            agent.user_id,
            err
          );
        }
      }
    }

    res.json({
      success: true,
      ...apiResponse({
        processed: signals.length,
        notificationsCreated,
      }),
    });
  } catch (err) {
    console.error('[signals] process-notifications error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
