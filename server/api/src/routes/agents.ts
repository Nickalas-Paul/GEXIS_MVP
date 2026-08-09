/**
 * Agent profile CRUD & onboarding (Phase 7).
 *
 * GET  /api/agents/me
 * GET  /api/agents/:id
 * POST /api/agents
 * PUT  /api/agents/:id
 */

import {
  AGENT_CATEGORY_KEYS,
  RESPONSE_TIME_KEYS,
  type Agent,
  type AgentCategory,
  type ResponseTime,
} from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENT_CATEGORY_SET = new Set<string>(AGENT_CATEGORY_KEYS);
const RESPONSE_TIME_SET = new Set<string>(RESPONSE_TIME_KEYS);

const AGENT_SELECT = `
  id, user_id, name, company, category, custom_category, geography_ids,
  verified, rating, engagement_count, response_time, industry_verticals,
  domain_tags, specializations, bio, website, created_at, updated_at
`;

type AgentRow = {
  id: string;
  user_id: string | null;
  name: string;
  company: string | null;
  category: string;
  custom_category: string | null;
  geography_ids: string[] | null;
  verified: boolean;
  rating: string | number | null;
  engagement_count: number;
  response_time: string | null;
  industry_verticals: string[] | null;
  domain_tags: string[] | null;
  specializations: unknown | null;
  bio: string | null;
  website: string | null;
  created_at: Date;
  updated_at: Date;
};

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    company: row.company,
    category: row.category as AgentCategory,
    customCategory: row.custom_category,
    geographyIds: row.geography_ids ?? [],
    verified: row.verified,
    rating: row.rating == null ? 0 : Number(row.rating),
    engagementCount: row.engagement_count,
    responseTime: (row.response_time as ResponseTime | null) ?? null,
    industryVerticals: row.industry_verticals ?? [],
    domainTags: row.domain_tags ?? [],
    specializations: row.specializations ?? null,
    bio: row.bio,
    website: row.website,
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

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseOptionalString(
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

function parseStringArray(
  raw: unknown,
  field: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${field} must be an array of strings` };
  }
  const value: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: `${field} must be an array of strings` };
    }
    const trimmed = item.trim();
    if (trimmed) value.push(trimmed);
  }
  return { ok: true, value };
}

function parseUuidArray(
  raw: unknown,
  field: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  const parsed = parseStringArray(raw, field);
  if (!parsed.ok) return parsed;
  for (const id of parsed.value) {
    if (!UUID_RE.test(id)) {
      return { ok: false, error: `${field} must contain valid UUIDs` };
    }
  }
  return parsed;
}

type CreateFields = {
  name: string;
  company: string | null;
  category: AgentCategory;
  customCategory: string | null;
  industryVerticals: string[];
  domainTags: string[];
  bio: string | null;
  website: string | null;
  geographyIds: string[];
  responseTime: ResponseTime | null;
};

function parseCreateBody(
  body: Record<string, unknown>
): { ok: true; value: CreateFields } | { ok: false; error: string; code?: string } {
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return { ok: false, error: 'name is required' };
  }
  const name = body.name.trim();
  if (name.length > 255) {
    return { ok: false, error: 'name must be at most 255 characters' };
  }

  const companyParsed = parseOptionalString(body.company, 'company', 255);
  if (!companyParsed.ok) return companyParsed;

  if (typeof body.category !== 'string' || !body.category.trim()) {
    return { ok: false, error: 'category is required' };
  }
  const category = body.category.trim();
  if (!AGENT_CATEGORY_SET.has(category)) {
    return { ok: false, error: 'category is invalid' };
  }

  let customCategory: string | null = null;
  if (category === 'other') {
    const customParsed = parseOptionalString(
      body.customCategory,
      'customCategory',
      100
    );
    if (!customParsed.ok) return customParsed;
    if (!customParsed.value) {
      return {
        ok: false,
        error: 'custom_category_required',
        code: 'custom_category_required',
      };
    }
    customCategory = customParsed.value;
  }

  const industryVerticals = parseStringArray(
    body.industryVerticals,
    'industryVerticals'
  );
  if (!industryVerticals.ok) return industryVerticals;

  const domainTags = parseStringArray(body.domainTags, 'domainTags');
  if (!domainTags.ok) return domainTags;

  const bioParsed = parseOptionalString(body.bio, 'bio');
  if (!bioParsed.ok) return bioParsed;

  const websiteParsed = parseOptionalString(body.website, 'website', 500);
  if (!websiteParsed.ok) return websiteParsed;

  const geographyIds = parseUuidArray(body.geographyIds, 'geographyIds');
  if (!geographyIds.ok) return geographyIds;

  let responseTime: ResponseTime | null = null;
  if (body.responseTime !== undefined && body.responseTime !== null) {
    if (typeof body.responseTime !== 'string') {
      return { ok: false, error: 'responseTime must be a string' };
    }
    const rt = body.responseTime.trim();
    if (rt && !RESPONSE_TIME_SET.has(rt)) {
      return { ok: false, error: 'responseTime is invalid' };
    }
    responseTime = (rt || null) as ResponseTime | null;
  }

  return {
    ok: true,
    value: {
      name,
      company: companyParsed.value,
      category: category as AgentCategory,
      customCategory,
      industryVerticals: industryVerticals.value,
      domainTags: domainTags.value,
      bio: bioParsed.value,
      website: websiteParsed.value,
      geographyIds: geographyIds.value,
      responseTime,
    },
  };
}

/** GET /api/agents/me — authenticated user's agent profile */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query<AgentRow>(
      `SELECT ${AGENT_SELECT}
       FROM agents
       WHERE user_id = $1`,
      [req.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json(apiError('no_agent_profile'));
      return;
    }

    res.json(apiResponse(toAgent(result.rows[0])));
  } catch (err) {
    console.error('[agents] me error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** GET /api/agents/:id — public agent profile */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!UUID_RE.test(id)) {
      res.status(400).json(apiError('id must be a valid UUID'));
      return;
    }

    const result = await pool.query<AgentRow>(
      `SELECT ${AGENT_SELECT}
       FROM agents
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json(apiError('agent_not_found'));
      return;
    }

    res.json(apiResponse(toAgent(result.rows[0])));
  } catch (err) {
    console.error('[agents] getById error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** POST /api/agents — create agent profile (onboarding) */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM agents WHERE user_id = $1`,
      [req.user!.id]
    );
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json(apiError('agent_profile_exists'));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = parseCreateBody(body);
    if (!parsed.ok) {
      res
        .status(400)
        .json(apiError(parsed.code ?? parsed.error));
      return;
    }

    const v = parsed.value;
    const result = await pool.query<AgentRow>(
      `INSERT INTO agents (
         user_id, name, company, category, custom_category,
         industry_verticals, domain_tags, bio, website,
         geography_ids, response_time
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::text[], $7::text[], $8, $9,
         $10::uuid[], $11
       )
       RETURNING ${AGENT_SELECT}`,
      [
        req.user!.id,
        v.name,
        v.company,
        v.category,
        v.customCategory,
        v.industryVerticals,
        v.domainTags,
        v.bio,
        v.website,
        v.geographyIds,
        v.responseTime,
      ]
    );

    res.status(201).json(apiResponse(toAgent(result.rows[0])));
  } catch (err) {
    console.error('[agents] create error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** PUT /api/agents/:id — update own agent profile */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!UUID_RE.test(id)) {
      res.status(400).json(apiError('id must be a valid UUID'));
      return;
    }

    const existing = await pool.query<AgentRow>(
      `SELECT ${AGENT_SELECT}
       FROM agents
       WHERE id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      res.status(404).json(apiError('agent_not_found'));
      return;
    }

    const current = existing.rows[0];
    if (current.user_id !== req.user!.id) {
      res.status(403).json(apiError('not_owner'));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: string[] = [];
    const params: unknown[] = [];

    const push = (col: string, value: unknown) => {
      params.push(value);
      updates.push(`${col} = $${params.length}`);
    };

    if (hasOwn(body, 'name')) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json(apiError('name must be a non-empty string'));
        return;
      }
      const name = body.name.trim();
      if (name.length > 255) {
        res.status(400).json(apiError('name must be at most 255 characters'));
        return;
      }
      push('name', name);
    }

    if (hasOwn(body, 'company')) {
      const companyParsed = parseOptionalString(body.company, 'company', 255);
      if (!companyParsed.ok) {
        res.status(400).json(apiError(companyParsed.error));
        return;
      }
      push('company', companyParsed.value);
    }

    let nextCategory: AgentCategory | null = null;
    if (hasOwn(body, 'category')) {
      if (typeof body.category !== 'string' || !body.category.trim()) {
        res.status(400).json(apiError('category must be a non-empty string'));
        return;
      }
      const category = body.category.trim();
      if (!AGENT_CATEGORY_SET.has(category)) {
        res.status(400).json(apiError('category is invalid'));
        return;
      }
      nextCategory = category as AgentCategory;
      push('category', nextCategory);
    }

    const effectiveCategory =
      nextCategory ?? (current.category as AgentCategory);

    if (hasOwn(body, 'category') || hasOwn(body, 'customCategory')) {
      if (effectiveCategory === 'other') {
        const customSource = hasOwn(body, 'customCategory')
          ? body.customCategory
          : current.custom_category;
        const customParsed = parseOptionalString(
          customSource,
          'customCategory',
          100
        );
        if (!customParsed.ok) {
          res.status(400).json(apiError(customParsed.error));
          return;
        }
        if (!customParsed.value) {
          res.status(400).json(apiError('custom_category_required'));
          return;
        }
        push('custom_category', customParsed.value);
      } else {
        push('custom_category', null);
      }
    }

    if (hasOwn(body, 'industryVerticals')) {
      const parsed = parseStringArray(
        body.industryVerticals,
        'industryVerticals'
      );
      if (!parsed.ok) {
        res.status(400).json(apiError(parsed.error));
        return;
      }
      params.push(parsed.value);
      updates.push(`industry_verticals = $${params.length}::text[]`);
    }

    if (hasOwn(body, 'domainTags')) {
      const parsed = parseStringArray(body.domainTags, 'domainTags');
      if (!parsed.ok) {
        res.status(400).json(apiError(parsed.error));
        return;
      }
      params.push(parsed.value);
      updates.push(`domain_tags = $${params.length}::text[]`);
    }

    if (hasOwn(body, 'bio')) {
      const bioParsed = parseOptionalString(body.bio, 'bio');
      if (!bioParsed.ok) {
        res.status(400).json(apiError(bioParsed.error));
        return;
      }
      push('bio', bioParsed.value);
    }

    if (hasOwn(body, 'website')) {
      const websiteParsed = parseOptionalString(body.website, 'website', 500);
      if (!websiteParsed.ok) {
        res.status(400).json(apiError(websiteParsed.error));
        return;
      }
      push('website', websiteParsed.value);
    }

    if (hasOwn(body, 'geographyIds')) {
      const parsed = parseUuidArray(body.geographyIds, 'geographyIds');
      if (!parsed.ok) {
        res.status(400).json(apiError(parsed.error));
        return;
      }
      params.push(parsed.value);
      updates.push(`geography_ids = $${params.length}::uuid[]`);
    }

    if (hasOwn(body, 'responseTime')) {
      if (body.responseTime === null || body.responseTime === '') {
        push('response_time', null);
      } else if (typeof body.responseTime !== 'string') {
        res.status(400).json(apiError('responseTime must be a string'));
        return;
      } else {
        const rt = body.responseTime.trim();
        if (!RESPONSE_TIME_SET.has(rt)) {
          res.status(400).json(apiError('responseTime is invalid'));
          return;
        }
        push('response_time', rt);
      }
    }

    if (updates.length === 0) {
      res.status(400).json(apiError('No updatable fields provided'));
      return;
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await pool.query<AgentRow>(
      `UPDATE agents
       SET ${updates.join(', ')}
       WHERE id = $${params.length}
       RETURNING ${AGENT_SELECT}`,
      params
    );

    res.json(apiResponse(toAgent(result.rows[0])));
  } catch (err) {
    console.error('[agents] update error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
