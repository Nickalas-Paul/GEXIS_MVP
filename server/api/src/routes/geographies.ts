/**
 * Geography + MVI score routes (public).
 *
 * Static paths (/search, /geojson, /filter) MUST be registered before /:id.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import {
  computeWeightedOverall,
  DEFAULT_VERTICAL,
  MVI_SCORING_VERSION,
  resolveVerticalKey,
  STORED_MVI_VERTICAL,
} from '../config/mvi';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

type Confidence = 'high' | 'medium' | 'low';

interface MviDimensions {
  marketSizeAndGrowth: number | null;
  talentDensity: number | null;
  taxEnvironment: number | null;
  regulatoryEase: number | null;
  infrastructure: number | null;
  competitorSaturation: number | null;
}

interface DbGeoRow {
  id: string;
  name: string;
  iso_code: string | null;
  region_type: string;
  region_label: string | null;
  population: string | null;
  gdp_ppp: string | null;
  centroid_lng: number | null;
  centroid_lat: number | null;
  bbox_west: number | null;
  bbox_south: number | null;
  bbox_east: number | null;
  bbox_north: number | null;
  geometry_geojson?: string | null;
  overall_score: string | null;
  dimensions: MviDimensions | null;
  confidence: Confidence | null;
  data_freshness: Date | null;
  calculated_at: Date | null;
  sources?: unknown;
}

const GEO_SELECT = `
  g.id,
  g.name,
  g.iso_code,
  g.region_type,
  g.region_label,
  g.population,
  g.gdp_ppp,
  ST_X(g.centroid) AS centroid_lng,
  ST_Y(g.centroid) AS centroid_lat,
  ST_XMin(g.geometry) AS bbox_west,
  ST_YMin(g.geometry) AS bbox_south,
  ST_XMax(g.geometry) AS bbox_east,
  ST_YMax(g.geometry) AS bbox_north,
  m.overall_score,
  m.dimensions,
  m.confidence,
  m.data_freshness,
  m.calculated_at
`;

function parseVertical(raw: unknown): string {
  return resolveVerticalKey(raw);
}

function parseFields(raw: unknown): Set<string> {
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean)
  );
}

function formatDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildMvi(
  row: DbGeoRow,
  includeSources: boolean,
  verticalKey: string
): Record<string, unknown> | null {
  if (row.overall_score == null && row.dimensions == null && row.confidence == null) {
    return null;
  }
  const weighted = computeWeightedOverall(row.dimensions, verticalKey);
  const mvi: Record<string, unknown> = {
    overall:
      weighted ??
      (row.overall_score != null ? Number(row.overall_score) : null),
    dimensions: row.dimensions,
    confidence: row.confidence,
    dataFreshness: formatDateOnly(row.data_freshness),
    calculatedAt: row.calculated_at
      ? new Date(row.calculated_at).toISOString()
      : null,
    vertical: verticalKey || DEFAULT_VERTICAL,
  };
  if (includeSources) {
    mvi.sources = row.sources ?? [];
  }
  return mvi;
}

function mapGeography(
  row: DbGeoRow,
  opts: {
    includeGeometry?: boolean;
    includeSources?: boolean;
    vertical?: string;
  } = {}
): Record<string, unknown> {
  const vertical = resolveVerticalKey(opts.vertical);
  const out: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    isoCode: row.iso_code,
    regionType: row.region_type,
    region: row.region_label,
    centroid:
      row.centroid_lat != null && row.centroid_lng != null
        ? { lat: Number(row.centroid_lat), lng: Number(row.centroid_lng) }
        : null,
    bbox:
      row.bbox_west != null
        ? {
            west: Number(row.bbox_west),
            south: Number(row.bbox_south),
            east: Number(row.bbox_east),
            north: Number(row.bbox_north),
          }
        : null,
    population: row.population != null ? Number(row.population) : null,
    gdpPpp: row.gdp_ppp != null ? Number(row.gdp_ppp) : null,
    mvi: buildMvi(row, Boolean(opts.includeSources), vertical),
  };

  if (opts.includeGeometry && row.geometry_geojson) {
    out.geometry = JSON.parse(row.geometry_geojson);
  }

  return out;
}

async function metaCounts(): Promise<{ total: number; scored: number }> {
  const result = await pool.query<{ total: string; scored: string }>(
    `
    SELECT
      count(*)::text AS total,
      count(*) FILTER (WHERE m.overall_score IS NOT NULL)::text AS scored
    FROM geographies g
    LEFT JOIN mvi_scores m
      ON m.geography_id = g.id
     AND m.industry_vertical = $1
    WHERE g.region_type = 'country'
    `,
    [STORED_MVI_VERTICAL]
  );
  return {
    total: Number(result.rows[0]?.total ?? 0),
    scored: Number(result.rows[0]?.scored ?? 0),
  };
}

/** GET /api/geographies */
router.get('/', async (req: Request, res: Response) => {
  try {
    const vertical = parseVertical(req.query.vertical);
    const fields = parseFields(req.query.fields);
    const includeGeometry = fields.has('geometry');
    const includeSources = fields.has('sources');
    const regionType =
      typeof req.query.region_type === 'string' && req.query.region_type.trim()
        ? req.query.region_type.trim()
        : 'country';

    const params: unknown[] = [STORED_MVI_VERTICAL, regionType];
    const where: string[] = ['g.region_type = $2'];

    if (req.query.min_score != null && String(req.query.min_score).length) {
      params.push(Number(req.query.min_score));
      where.push(`m.overall_score >= $${params.length}`);
    }
    if (req.query.max_score != null && String(req.query.max_score).length) {
      params.push(Number(req.query.max_score));
      where.push(`m.overall_score <= $${params.length}`);
    }
    if (typeof req.query.confidence === 'string' && req.query.confidence.trim()) {
      params.push(req.query.confidence.trim());
      where.push(`m.confidence = $${params.length}`);
    }

    const geometrySelect = includeGeometry
      ? ', ST_AsGeoJSON(g.geometry) AS geometry_geojson'
      : '';
    const sourcesSelect = includeSources ? ', m.sources' : '';

    const result = await pool.query<DbGeoRow>(
      `
      SELECT ${GEO_SELECT}${geometrySelect}${sourcesSelect}
      FROM geographies g
      LEFT JOIN mvi_scores m
        ON m.geography_id = g.id
       AND m.industry_vertical = $1
      WHERE ${where.join(' AND ')}
      ORDER BY g.name ASC
      `,
      params
    );

    const counts = await metaCounts();
    const data = result.rows.map((row) =>
      mapGeography(row, { includeGeometry, includeSources, vertical })
    );

    res.json(
      apiResponse(data, {
        total: counts.total,
        scored: counts.scored,
        vertical,
        dataVersion: MVI_SCORING_VERSION,
        returned: data.length,
      })
    );
  } catch (err) {
    console.error('[geographies] list error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** GET /api/geographies/search — spatial bbox or point+radius */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const vertical = parseVertical(req.query.vertical);
    const hasBbox = typeof req.query.bbox === 'string' && req.query.bbox.trim();
    const hasPoint = typeof req.query.point === 'string' && req.query.point.trim();
    const hasRadius = req.query.radius != null && String(req.query.radius).length > 0;

    if (hasBbox && (hasPoint || hasRadius)) {
      res
        .status(400)
        .json(apiError('Provide either bbox or point+radius, not both'));
      return;
    }
    if (!hasBbox && !(hasPoint && hasRadius)) {
      res
        .status(400)
        .json(apiError('Provide bbox=west,south,east,north or point=lat,lng with radius (km)'));
      return;
    }

    const params: unknown[] = [STORED_MVI_VERTICAL];
    let spatialClause = '';

    if (hasBbox) {
      const parts = String(req.query.bbox)
        .split(',')
        .map((p) => Number(p.trim()));
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
        res.status(400).json(apiError('bbox must be west,south,east,north'));
        return;
      }
      const [west, south, east, north] = parts;
      params.push(west, south, east, north);
      spatialClause = `AND g.geometry && ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
    } else {
      const pointParts = String(req.query.point)
        .split(',')
        .map((p) => Number(p.trim()));
      const radiusKm = Number(req.query.radius);
      if (pointParts.length !== 2 || pointParts.some((n) => Number.isNaN(n))) {
        res.status(400).json(apiError('point must be lat,lng'));
        return;
      }
      if (Number.isNaN(radiusKm) || radiusKm <= 0) {
        res.status(400).json(apiError('radius must be a positive number (km)'));
        return;
      }
      const [lat, lng] = pointParts;
      const radiusMeters = radiusKm * 1000;
      params.push(lng, lat, radiusMeters);
      spatialClause = `
        AND ST_DWithin(
          g.geometry::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          $4
        )
      `;
    }

    const result = await pool.query<DbGeoRow>(
      `
      SELECT ${GEO_SELECT}
      FROM geographies g
      LEFT JOIN mvi_scores m
        ON m.geography_id = g.id
       AND m.industry_vertical = $1
      WHERE g.region_type = 'country'
        ${spatialClause}
      ORDER BY g.name ASC
      `,
      params
    );

    const data = result.rows.map((row) => mapGeography(row, { vertical }));
    res.json(
      apiResponse(data, {
        total: data.length,
        vertical,
        dataVersion: MVI_SCORING_VERSION,
      })
    );
  } catch (err) {
    console.error('[geographies] search error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** GET /api/geographies/geojson — FeatureCollection for Mapbox */
router.get('/geojson', async (req: Request, res: Response) => {
  try {
    const vertical = parseVertical(req.query.vertical);
    const simplified =
      req.query.simplified === undefined
        ? true
        : String(req.query.simplified).toLowerCase() !== 'false';

    const geomExpr = simplified
      ? 'ST_Simplify(g.geometry, 0.01)'
      : 'g.geometry';

    const result = await pool.query<{
      id: string;
      name: string;
      iso_code: string | null;
      population: string | null;
      overall_score: string | null;
      dimensions: MviDimensions | null;
      confidence: string | null;
      geometry_geojson: string | null;
    }>(
      `
      SELECT
        g.id,
        g.name,
        g.iso_code,
        g.population,
        m.overall_score,
        m.dimensions,
        m.confidence,
        ST_AsGeoJSON(${geomExpr}) AS geometry_geojson
      FROM geographies g
      LEFT JOIN mvi_scores m
        ON m.geography_id = g.id
       AND m.industry_vertical = $1
      WHERE g.region_type = 'country'
        AND g.geometry IS NOT NULL
      ORDER BY g.name ASC
      `,
      [STORED_MVI_VERTICAL]
    );

    const features = result.rows.map((row) => {
      const dims = row.dimensions ?? ({} as MviDimensions);
      const overall = computeWeightedOverall(dims, vertical);
      return {
        type: 'Feature',
        id: row.iso_code ?? row.id,
        properties: {
          id: row.id,
          name: row.name,
          isoCode: row.iso_code,
          overall,
          overallScore: overall,
          marketSizeAndGrowth: dims.marketSizeAndGrowth ?? null,
          talentDensity: dims.talentDensity ?? null,
          taxEnvironment: dims.taxEnvironment ?? null,
          regulatoryEase: dims.regulatoryEase ?? null,
          infrastructure: dims.infrastructure ?? null,
          competitorSaturation: dims.competitorSaturation ?? null,
          confidence: row.confidence,
          population: row.population != null ? Number(row.population) : null,
          vertical,
        },
        geometry: row.geometry_geojson ? JSON.parse(row.geometry_geojson) : null,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      type: 'FeatureCollection',
      features,
      meta: { vertical, dataVersion: MVI_SCORING_VERSION },
    });
  } catch (err) {
    console.error('[geographies] geojson error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/**
 * POST /api/geographies/filter
 *
 * Dimension filters use mvi_scores.dimensions JSONB (0–100 scores).
 * maxCorpTaxRate joins raw_indicators for the latest tax_foundation corp_tax_rate
 * (raw percent), matching the mockup filter semantics.
 */
router.post('/filter', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const vertical = parseVertical(body.vertical);
    const filters = (body.filters ?? {}) as Record<string, unknown>;
    const sort = (body.sort ?? { field: 'overall', direction: 'desc' }) as {
      field?: string;
      direction?: string;
    };
    let limit = Number(body.limit ?? 50);
    if (Number.isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const params: unknown[] = [STORED_MVI_VERTICAL];
    const where: string[] = [`g.region_type = 'country'`];

    const addNumFilter = (value: unknown, sql: string) => {
      if (value === null || value === undefined || value === '') return;
      const n = Number(value);
      if (Number.isNaN(n)) return;
      params.push(n);
      where.push(sql.replace('?', `$${params.length}`));
    };

    addNumFilter(filters.minOverallScore, 'm.overall_score >= ?');
    addNumFilter(filters.maxOverallScore, 'm.overall_score <= ?');
    addNumFilter(filters.minPopulation, 'g.population >= ?');
    addNumFilter(
      filters.minTalentDensity,
      `(m.dimensions->>'talentDensity')::numeric >= ?`
    );
    addNumFilter(
      filters.maxCompetitorSaturation,
      `(m.dimensions->>'competitorSaturation')::numeric <= ?`
    );
    addNumFilter(
      filters.minRegulatoryEase,
      `(m.dimensions->>'regulatoryEase')::numeric >= ?`
    );
    addNumFilter(
      filters.minInfrastructure,
      `(m.dimensions->>'infrastructure')::numeric >= ?`
    );
    addNumFilter(
      filters.minMarketSizeAndGrowth,
      `(m.dimensions->>'marketSizeAndGrowth')::numeric >= ?`
    );
    addNumFilter(
      filters.minTaxEnvironment,
      `(m.dimensions->>'taxEnvironment')::numeric >= ?`
    );

    // Raw corp tax rate (percent) — latest non-null tax_foundation value
    if (
      filters.maxCorpTaxRate !== null &&
      filters.maxCorpTaxRate !== undefined &&
      filters.maxCorpTaxRate !== ''
    ) {
      const maxTax = Number(filters.maxCorpTaxRate);
      if (!Number.isNaN(maxTax)) {
        params.push(maxTax);
        where.push(`
          EXISTS (
            SELECT 1
            FROM (
              SELECT DISTINCT ON (ri.geography_id) ri.geography_id, ri.value
              FROM raw_indicators ri
              WHERE ri.source = 'tax_foundation'
                AND ri.indicator_code = 'corp_tax_rate'
                AND ri.value IS NOT NULL
              ORDER BY ri.geography_id, ri.year DESC
            ) tax
            WHERE tax.geography_id = g.id
              AND tax.value <= $${params.length}
          )
        `);
      }
    }

    const sortField = (sort.field ?? 'overall').toLowerCase();
    const sortDir =
      String(sort.direction ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const dimensionSortKeys = new Set([
      'marketsizeandgrowth',
      'talentdensity',
      'taxenvironment',
      'regulatoryease',
      'infrastructure',
      'competitorsaturation',
    ]);

    // Fetch without relying on stored overall for final ranking when vertical weights apply.
    // Prefer name order in SQL; re-sort in memory by weighted overall / dimension.
    let orderBy = `g.name ASC`;
    if (sortField !== 'overall' && dimensionSortKeys.has(sortField.replace(/_/g, ''))) {
      const keyMap: Record<string, string> = {
        marketsizeandgrowth: 'marketSizeAndGrowth',
        talentdensity: 'talentDensity',
        taxenvironment: 'taxEnvironment',
        regulatoryease: 'regulatoryEase',
        infrastructure: 'infrastructure',
        competitorsaturation: 'competitorSaturation',
      };
      const dimKey = keyMap[sortField.replace(/_/g, '')];
      orderBy = `(m.dimensions->>'${dimKey}')::numeric ${sortDir} NULLS LAST, g.name ASC`;
    }

    // Over-fetch then trim after weighted sort so Top Matches ranks by vertical overall.
    const fetchLimit = Math.min(500, Math.max(limit * 3, 200));
    params.push(fetchLimit);
    const result = await pool.query<DbGeoRow>(
      `
      SELECT ${GEO_SELECT}
      FROM geographies g
      LEFT JOIN mvi_scores m
        ON m.geography_id = g.id
       AND m.industry_vertical = $1
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${params.length}
      `,
      params
    );

    let data = result.rows.map((row) => mapGeography(row, { vertical }));
    if (sortField === 'overall') {
      const dir = sortDir === 'ASC' ? 1 : -1;
      data = [...data].sort((a, b) => {
        const ao = (a.mvi as { overall?: number | null } | null)?.overall;
        const bo = (b.mvi as { overall?: number | null } | null)?.overall;
        if (ao == null && bo == null) return 0;
        if (ao == null) return 1;
        if (bo == null) return -1;
        return (ao - bo) * dir;
      });
    }
    data = data.slice(0, limit);

    res.json(
      apiResponse(data, {
        total: data.length,
        vertical,
        dataVersion: MVI_SCORING_VERSION,
        limit,
        // MVP note: maxCorpTaxRate filters raw tax_foundation rates;
        // other dimension filters use 0–100 MVI dimension scores.
        filterMode: 'dimensions_plus_raw_corp_tax',
      })
    );
  } catch (err) {
    console.error('[geographies] filter error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

/** GET /api/geographies/:id — UUID or ISO alpha-3 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const vertical = parseVertical(req.query.vertical);
    const isIso = /^[A-Za-z]{3}$/.test(id);

    const result = await pool.query<DbGeoRow>(
      `
      SELECT
        ${GEO_SELECT},
        ST_AsGeoJSON(g.geometry) AS geometry_geojson,
        m.sources
      FROM geographies g
      LEFT JOIN mvi_scores m
        ON m.geography_id = g.id
       AND m.industry_vertical = $1
      WHERE ${isIso ? 'upper(g.iso_code) = upper($2)' : 'g.id = $2::uuid'}
      LIMIT 1
      `,
      [STORED_MVI_VERTICAL, isIso ? id.toUpperCase() : id]
    );

    if (result.rows.length === 0) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }

    res.json(
      apiResponse(
        mapGeography(result.rows[0], {
          includeGeometry: true,
          includeSources: true,
          vertical,
        })
      )
    );
  } catch (err) {
    console.error('[geographies] getById error:', err);
    // Invalid UUID format surfaces as a query error — treat as not found
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === '22P02'
    ) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
