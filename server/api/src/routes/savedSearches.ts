/**
 * Saved searches CRUD (Pro+ when gating is on; any authenticated user in beta).
 *
 * GET    /api/saved-searches
 * POST   /api/saved-searches
 * PUT    /api/saved-searches/:id
 * DELETE /api/saved-searches/:id
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SavedSearchRow = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

function toPublicSearch(row: SavedSearchRow) {
  return {
    id: row.id,
    name: row.name,
    // Preserve filter keys exactly as stored (opaque JSONB config).
    filters: row.filters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'name must be a string' };
  }
  const value = raw.trim();
  if (!value) {
    return { ok: false, error: 'name is required' };
  }
  if (value.length > 100) {
    return { ok: false, error: 'name must be at most 100 characters' };
  }
  return { ok: true, value };
}

function parseFilters(
  raw: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, error: 'filters is required' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'filters must be a non-null object' };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

/** GET /api/saved-searches */
router.get(
  '/',
  requireAuth,
  requireTier('pro'),
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query<SavedSearchRow>(
        `SELECT id, user_id, name, filters, created_at, updated_at
         FROM saved_searches
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [req.user!.id]
      );
      res.json(apiResponse(result.rows.map(toPublicSearch)));
    } catch (err) {
      console.error('[saved-searches] list error:', err);
      res.status(500).json(apiError('Internal server error'));
    }
  }
);

/** POST /api/saved-searches */
router.post(
  '/',
  requireAuth,
  requireTier('pro'),
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const nameParsed = parseName(body.name);
      if (!nameParsed.ok) {
        res.status(400).json(apiError(nameParsed.error));
        return;
      }
      const filtersParsed = parseFilters(body.filters);
      if (!filtersParsed.ok) {
        res.status(400).json(apiError(filtersParsed.error));
        return;
      }

      const result = await pool.query<SavedSearchRow>(
        `INSERT INTO saved_searches (user_id, name, filters)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id, user_id, name, filters, created_at, updated_at`,
        [req.user!.id, nameParsed.value, JSON.stringify(filtersParsed.value)]
      );

      res.status(201).json(apiResponse(toPublicSearch(result.rows[0])));
    } catch (err) {
      console.error('[saved-searches] create error:', err);
      res.status(500).json(apiError('Internal server error'));
    }
  }
);

/** PUT /api/saved-searches/:id */
router.put(
  '/:id',
  requireAuth,
  requireTier('pro'),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? '').trim();
      if (!UUID_RE.test(id)) {
        res.status(400).json(apiError('id must be a valid UUID'));
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
      const hasFilters = Object.prototype.hasOwnProperty.call(body, 'filters');

      if (!hasName && !hasFilters) {
        res.status(400).json(apiError('Provide name and/or filters to update'));
        return;
      }

      let nextName: string | null = null;
      if (hasName) {
        const nameParsed = parseName(body.name);
        if (!nameParsed.ok) {
          res.status(400).json(apiError(nameParsed.error));
          return;
        }
        nextName = nameParsed.value;
      }

      let nextFilters: Record<string, unknown> | null = null;
      if (hasFilters) {
        const filtersParsed = parseFilters(body.filters);
        if (!filtersParsed.ok) {
          res.status(400).json(apiError(filtersParsed.error));
          return;
        }
        nextFilters = filtersParsed.value;
      }

      const result = await pool.query<SavedSearchRow>(
        `UPDATE saved_searches
         SET
           name = COALESCE($1, name),
           filters = COALESCE($2::jsonb, filters),
           updated_at = NOW()
         WHERE id = $3 AND user_id = $4
         RETURNING id, user_id, name, filters, created_at, updated_at`,
        [
          nextName,
          nextFilters != null ? JSON.stringify(nextFilters) : null,
          id,
          req.user!.id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json(apiError('Saved search not found'));
        return;
      }

      res.json(apiResponse(toPublicSearch(result.rows[0])));
    } catch (err) {
      console.error('[saved-searches] update error:', err);
      res.status(500).json(apiError('Internal server error'));
    }
  }
);

/** DELETE /api/saved-searches/:id */
router.delete(
  '/:id',
  requireAuth,
  requireTier('pro'),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? '').trim();
      if (!UUID_RE.test(id)) {
        res.status(400).json(apiError('id must be a valid UUID'));
        return;
      }

      const result = await pool.query(
        `DELETE FROM saved_searches
         WHERE id = $1 AND user_id = $2`,
        [id, req.user!.id]
      );

      if (result.rowCount === 0) {
        res.status(404).json(apiError('Saved search not found'));
        return;
      }

      res.status(204).send();
    } catch (err) {
      console.error('[saved-searches] delete error:', err);
      res.status(500).json(apiError('Internal server error'));
    }
  }
);

export default router;