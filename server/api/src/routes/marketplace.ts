/**
 * Marketplace directory (Phase 7).
 *
 * GET /api/marketplace/agents — public search / filter / sort / facets
 */

import {
  AGENT_CATEGORY_KEYS,
  type AgentCard,
  type AgentCategory,
  type ResponseTime,
} from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENT_CATEGORY_SET = new Set<string>(AGENT_CATEGORY_KEYS);

const SORT_KEYS = new Set(['rating', 'engagements', 'response_time']);

type AgentCardRow = {
  id: string;
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
  geography_ids: string[] | null;
};

function toAgentCard(row: AgentCardRow): AgentCard {
  return {
    id: row.id,
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
    geographyIds: row.geography_ids ?? [],
  };
}

function emptyCategoryFacets(): Record<AgentCategory, number> {
  const facets = {} as Record<AgentCategory, number>;
  for (const key of AGENT_CATEGORY_KEYS) {
    facets[key] = 0;
  }
  return facets;
}

type FilterBuild = {
  whereSql: string;
  facetWhereSql: string;
  params: unknown[];
  facetParams: unknown[];
  queryParamIndex: number | null;
};

function buildFilters(opts: {
  geography?: string;
  category?: string;
  vertical?: string;
  query?: string;
}): FilterBuild {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const facetParams: unknown[] = [];
  const facetClauses: string[] = [];
  let queryParamIndex: number | null = null;

  const pushBoth = (clause: string, value: unknown) => {
    params.push(value);
    facetParams.push(value);
    const idx = params.length;
    const facetIdx = facetParams.length;
    clauses.push(clause.replace(/\$N/g, `$${idx}`));
    facetClauses.push(clause.replace(/\$N/g, `$${facetIdx}`));
  };

  if (opts.geography) {
    pushBoth(`$N = ANY(geography_ids)`, opts.geography);
  }

  if (opts.vertical) {
    pushBoth(`industry_verticals @> ARRAY[$N]::text[]`, opts.vertical);
  }

  if (opts.query) {
    pushBoth(
      `search_vector @@ websearch_to_tsquery('english', $N)`,
      opts.query
    );
    queryParamIndex = params.length;
  }

  // Category filter applies to main query / total only (not facets)
  if (opts.category) {
    params.push(opts.category);
    clauses.push(`category = $${params.length}`);
  }

  return {
    whereSql: clauses.length ? clauses.join(' AND ') : 'TRUE',
    facetWhereSql: facetClauses.length ? facetClauses.join(' AND ') : 'TRUE',
    params,
    facetParams,
    queryParamIndex,
  };
}

function buildOrderBy(
  sort: string,
  queryParamIndex: number | null
): string {
  const parts: string[] = ['verified DESC'];

  if (queryParamIndex != null) {
    parts.push(
      `ts_rank(search_vector, websearch_to_tsquery('english', $${queryParamIndex})) DESC`
    );
  }

  if (sort === 'engagements') {
    parts.push('engagement_count DESC', 'rating DESC');
  } else if (sort === 'response_time') {
    parts.push(`CASE response_time
      WHEN '<24h' THEN 1
      WHEN '1-3d' THEN 2
      WHEN '3-7d' THEN 3
      WHEN '7d+' THEN 4
      ELSE 5
    END ASC`);
    parts.push('rating DESC');
  } else {
    // rating (default)
    parts.push('rating DESC', 'engagement_count DESC');
  }

  parts.push('name ASC');
  return parts.join(', ');
}

/**
 * GET /api/marketplace/agents
 * Public directory listing with filters, sort, FTS, facets, pagination.
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const geographyRaw =
      typeof req.query.geography === 'string' ? req.query.geography.trim() : '';
    const categoryRaw =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const verticalRaw =
      typeof req.query.vertical === 'string' ? req.query.vertical.trim() : '';
    const queryRaw =
      typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const sortRaw =
      typeof req.query.sort === 'string' ? req.query.sort.trim() : 'rating';

    if (geographyRaw && !UUID_RE.test(geographyRaw)) {
      res.status(400).json(apiError('geography must be a valid UUID'));
      return;
    }

    if (categoryRaw && !AGENT_CATEGORY_SET.has(categoryRaw)) {
      res.status(400).json(apiError('category is invalid'));
      return;
    }

    if (sortRaw && !SORT_KEYS.has(sortRaw)) {
      res.status(400).json(apiError('sort must be rating, engagements, or response_time'));
      return;
    }

    let page = Number(req.query.page ?? 1);
    if (!Number.isFinite(page) || page < 1) page = 1;
    page = Math.floor(page);

    let limit = Number(req.query.limit ?? 20);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    limit = Math.min(50, Math.floor(limit));

    const filters = buildFilters({
      geography: geographyRaw || undefined,
      category: categoryRaw || undefined,
      vertical: verticalRaw || undefined,
      query: queryRaw || undefined,
    });

    const orderBy = buildOrderBy(sortRaw || 'rating', filters.queryParamIndex);
    const offset = (page - 1) * limit;

    const listParams = [...filters.params, limit, offset];
    const limitIdx = filters.params.length + 1;
    const offsetIdx = filters.params.length + 2;

    const [listResult, countResult, facetResult] = await Promise.all([
      pool.query<AgentCardRow>(
        `
        SELECT id, name, company, category, custom_category, verified, rating,
               engagement_count, response_time, industry_verticals, domain_tags,
               geography_ids
        FROM agents
        WHERE ${filters.whereSql}
        ORDER BY ${orderBy}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        listParams
      ),
      pool.query<{ total: number }>(
        `
        SELECT COUNT(*)::int AS total
        FROM agents
        WHERE ${filters.whereSql}
        `,
        filters.params
      ),
      pool.query<{ category: string; count: number }>(
        `
        SELECT category, COUNT(*)::int AS count
        FROM agents
        WHERE ${filters.facetWhereSql}
        GROUP BY category
        `,
        filters.facetParams
      ),
    ]);

    const categories = emptyCategoryFacets();
    for (const row of facetResult.rows) {
      if (AGENT_CATEGORY_SET.has(row.category)) {
        categories[row.category as AgentCategory] = row.count;
      }
    }

    const total = countResult.rows[0]?.total ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.json(
      apiResponse({
        agents: listResult.rows.map(toAgentCard),
        facets: { categories },
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      })
    );
  } catch (err) {
    console.error('[marketplace] agents list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
