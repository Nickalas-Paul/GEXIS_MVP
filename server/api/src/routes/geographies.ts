/**
 * Geography + MVI score routes (public).
 *
 * Static paths (/search, /geojson, /filter) MUST be registered before /:id.
 */

import { getQuickFacts } from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import {
  computeWeightedOverall,
  DEFAULT_VERTICAL,
  DimensionKey,
  MVI_DIMENSIONS,
  MVI_SCORING_VERSION,
  resolveVerticalKey,
  STORED_MVI_VERTICAL,
} from '../config/mvi';
import { apiError, apiResponse } from '../utils/response';

const DIMENSION_KEYS: DimensionKey[] = MVI_DIMENSIONS.map((d) => d.key);
/** Base dimensions that have trend vectors (excludes composite Trajectory). */
const TREND_DIMENSION_KEYS: DimensionKey[] = MVI_DIMENSIONS.filter(
  (d) => !d.isComposite
).map((d) => d.key);

type TrendHorizon = '2yr' | '5yr';

function parseHorizon(raw: unknown): TrendHorizon | null {
  if (raw === '2yr' || raw === '5yr') return raw;
  return null;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const router = Router();

type Confidence = 'high' | 'medium' | 'low';

interface MviDimensions {
  marketSizeAndGrowth: number | null;
  talentDensity: number | null;
  taxEnvironment: number | null;
  regulatoryEase: number | null;
  infrastructure: number | null;
  competitorSaturation: number | null;
  trajectory: number | null;
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

interface QuickFactsPayload {
  population: number | null;
  gdpPpp: number | null;
  corpTaxRate: number | null;
  regulatoryQuality: number | null;
  easeOfBusiness: string | null;
  language: string | null;
  currency: string | null;
}

async function loadQuickFactsForGeography(
  geographyId: string,
  isoCode: string | null
): Promise<QuickFactsPayload> {
  const staticFacts = isoCode ? getQuickFacts(isoCode) : null;

  const indicators = await pool.query<{
    indicator_code: string;
    value: string;
  }>(
    `
    SELECT DISTINCT ON (indicator_code)
      indicator_code,
      value::text AS value
    FROM raw_indicators
    WHERE geography_id = $1
      AND value IS NOT NULL
      AND indicator_code = ANY($2::text[])
    ORDER BY indicator_code, year DESC
    `,
    [
      geographyId,
      [
        'SP.POP.TOTL',
        'imf_gdp_ppp',
        'NY.GDP.MKTP.PP.CD',
        'NGDPD',
        'corp_tax_rate',
        'RQ.PER.RNK',
      ],
    ]
  );

  const byCode = new Map(
    indicators.rows.map((r) => [r.indicator_code, Number(r.value)])
  );

  const population = byCode.has('SP.POP.TOTL')
    ? byCode.get('SP.POP.TOTL')!
    : null;

  // Prefer IMF PPP (stored as imf_gdp_ppp), then WB PPP, then IMF nominal.
  const gdpPpp = byCode.has('imf_gdp_ppp')
    ? byCode.get('imf_gdp_ppp')!
    : byCode.has('NY.GDP.MKTP.PP.CD')
      ? byCode.get('NY.GDP.MKTP.PP.CD')!
      : byCode.has('NGDPD')
        ? byCode.get('NGDPD')!
        : null;

  const corpTaxRate = byCode.has('corp_tax_rate')
    ? byCode.get('corp_tax_rate')!
    : null;

  const regulatoryQuality = byCode.has('RQ.PER.RNK')
    ? byCode.get('RQ.PER.RNK')!
    : null;

  let easeOfBusiness: string | null = null;
  if (regulatoryQuality != null) {
    const rankResult = await pool.query<{ rank: string }>(
      `
      WITH latest_rq AS (
        SELECT DISTINCT ON (geography_id)
          geography_id,
          value
        FROM raw_indicators
        WHERE indicator_code = 'RQ.PER.RNK'
          AND value IS NOT NULL
        ORDER BY geography_id, year DESC
      ),
      ranked AS (
        SELECT
          geography_id,
          RANK() OVER (ORDER BY value DESC) AS rank
        FROM latest_rq
      )
      SELECT rank::text AS rank
      FROM ranked
      WHERE geography_id = $1
      `,
      [geographyId]
    );
    const rank = rankResult.rows[0]?.rank;
    if (rank != null) {
      easeOfBusiness = `#${rank} globally`;
    }
  }

  return {
    population,
    gdpPpp,
    corpTaxRate,
    regulatoryQuality,
    easeOfBusiness,
    language: staticFacts?.language ?? null,
    currency: staticFacts?.currency ?? null,
  };
}

function mapGeography(
  row: DbGeoRow,
  opts: {
    includeGeometry?: boolean;
    includeSources?: boolean;
    vertical?: string;
    quickFacts?: QuickFactsPayload | null;
  } = {}
): Record<string, unknown> {
  const vertical = resolveVerticalKey(opts.vertical);
  const population =
    opts.quickFacts?.population ??
    (row.population != null ? Number(row.population) : null);
  const gdpPpp =
    opts.quickFacts?.gdpPpp ??
    (row.gdp_ppp != null ? Number(row.gdp_ppp) : null);

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
    population,
    gdpPpp,
    mvi: buildMvi(row, Boolean(opts.includeSources), vertical),
  };

  if (opts.quickFacts) {
    out.quickFacts = opts.quickFacts;
  }

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
    const horizon = parseHorizon(req.query.horizon);
    if (req.query.horizon !== undefined && horizon == null) {
      res.status(400).json(apiError('horizon must be 2yr or 5yr'));
      return;
    }
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

    /** geography_id → dimension → projected score */
    const projectedByGeo = new Map<string, Partial<Record<DimensionKey, number>>>();
    if (horizon) {
      const projCol =
        horizon === '2yr' ? 'projected_2yr' : 'projected_5yr';
      const trendResult = await pool.query<{
        geography_id: string;
        dimension: string;
        projected: string | null;
      }>(
        `
        SELECT
          geography_id::text AS geography_id,
          dimension,
          ${projCol}::text AS projected
        FROM trend_scores
        WHERE ${projCol} IS NOT NULL
        `
      );
      for (const row of trendResult.rows) {
        const dim = row.dimension as DimensionKey;
        if (!DIMENSION_KEYS.includes(dim)) continue;
        const projected = numOrNull(row.projected);
        if (projected == null) continue;
        let bucket = projectedByGeo.get(row.geography_id);
        if (!bucket) {
          bucket = {};
          projectedByGeo.set(row.geography_id, bucket);
        }
        bucket[dim] = projected;
      }
    }

    const features = result.rows.map((row) => {
      const dims = row.dimensions ?? ({} as MviDimensions);
      let overallDims: Partial<Record<DimensionKey, number | null>> = dims;
      if (horizon) {
        const projections = projectedByGeo.get(row.id);
        if (projections) {
          overallDims = { ...dims };
          for (const key of DIMENSION_KEYS) {
            if (projections[key] != null) {
              overallDims[key] = projections[key]!;
            }
            // else keep current dimension score (or null)
          }
        }
      }
      const overall = computeWeightedOverall(overallDims, vertical);
      return {
        type: 'Feature',
        id: row.iso_code ?? row.id,
        properties: {
          id: row.id,
          name: row.name,
          isoCode: row.iso_code,
          overall,
          overallScore: overall,
          marketSizeAndGrowth: overallDims.marketSizeAndGrowth ?? null,
          talentDensity: overallDims.talentDensity ?? null,
          taxEnvironment: overallDims.taxEnvironment ?? null,
          regulatoryEase: overallDims.regulatoryEase ?? null,
          infrastructure: overallDims.infrastructure ?? null,
          competitorSaturation: overallDims.competitorSaturation ?? null,
          trajectory: overallDims.trajectory ?? null,
          confidence: row.confidence,
          population: row.population != null ? Number(row.population) : null,
          vertical,
          horizon: horizon ?? null,
        },
        geometry: row.geometry_geojson ? JSON.parse(row.geometry_geojson) : null,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        vertical,
        dataVersion: MVI_SCORING_VERSION,
        horizon: horizon ?? null,
      },
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
    const nestedFilters =
      body.filters && typeof body.filters === 'object'
        ? (body.filters as Record<string, unknown>)
        : {};
    // Accept nested `filters` or top-level min*/max* keys (verify / clients).
    const filters: Record<string, unknown> = { ...nestedFilters };
    for (const [key, value] of Object.entries(body)) {
      if (key === 'filters' || key === 'vertical' || key === 'sort' || key === 'limit') {
        continue;
      }
      if (
        (key.startsWith('min') || key.startsWith('max')) &&
        filters[key] === undefined
      ) {
        filters[key] = value;
      }
    }
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
    addNumFilter(
      filters.minTrajectory,
      `(m.dimensions->>'trajectory')::numeric >= ?`
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
      'trajectory',
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
        trajectory: 'trajectory',
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

/** GET /api/geographies/:id/trends — per-dimension trend vectors */
router.get('/:id/trends', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const isIso = /^[A-Za-z]{3}$/.test(id);

    const geoResult = await pool.query<{
      id: string;
      name: string;
      iso_code: string | null;
    }>(
      `
      SELECT id, name, iso_code
      FROM geographies
      WHERE ${isIso ? 'upper(iso_code) = upper($1)' : 'id = $1::uuid'}
      LIMIT 1
      `,
      [isIso ? id.toUpperCase() : id]
    );

    if (geoResult.rows.length === 0) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }

    const geo = geoResult.rows[0];
    const trendResult = await pool.query<{
      dimension: string;
      direction: string;
      annualized_rate: string | null;
      acceleration: string | null;
      current_score: string | null;
      projected_2yr: string | null;
      projected_5yr: string | null;
      confidence_lower_2yr: string | null;
      confidence_upper_2yr: string | null;
      confidence_lower_5yr: string | null;
      confidence_upper_5yr: string | null;
      trend_confidence: string;
      data_points: number;
      year_range_start: number | null;
      year_range_end: number | null;
    }>(
      `
      SELECT
        dimension,
        direction,
        annualized_rate,
        acceleration,
        current_score,
        projected_2yr,
        projected_5yr,
        confidence_lower_2yr,
        confidence_upper_2yr,
        confidence_lower_5yr,
        confidence_upper_5yr,
        trend_confidence,
        data_points,
        year_range_start,
        year_range_end
      FROM trend_scores
      WHERE geography_id = $1
      `,
      [geo.id]
    );

    const byDim = new Map(trendResult.rows.map((r) => [r.dimension, r]));
    const trends: Record<string, unknown> = {};
    for (const key of TREND_DIMENSION_KEYS) {
      const row = byDim.get(key);
      if (!row) {
        trends[key] = null;
        continue;
      }
      const start = row.year_range_start;
      const end = row.year_range_end;
      trends[key] = {
        direction: row.direction,
        annualizedRate: numOrNull(row.annualized_rate),
        acceleration: numOrNull(row.acceleration),
        currentScore: numOrNull(row.current_score),
        projected2yr: numOrNull(row.projected_2yr),
        projected5yr: numOrNull(row.projected_5yr),
        confidence: {
          lower2yr: numOrNull(row.confidence_lower_2yr),
          upper2yr: numOrNull(row.confidence_upper_2yr),
          lower5yr: numOrNull(row.confidence_lower_5yr),
          upper5yr: numOrNull(row.confidence_upper_5yr),
        },
        trendConfidence: row.trend_confidence,
        dataPoints: row.data_points,
        yearRange:
          start != null && end != null ? ([start, end] as [number, number]) : null,
      };
    }

    res.json(
      apiResponse({
        isoCode: geo.iso_code,
        name: geo.name,
        trends,
      })
    );
  } catch (err) {
    console.error('[geographies] trends error:', err);
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

    const row = result.rows[0];
    const quickFacts = await loadQuickFactsForGeography(row.id, row.iso_code);

    res.json(
      apiResponse(
        mapGeography(row, {
          includeGeometry: true,
          includeSources: true,
          vertical,
          quickFacts,
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
