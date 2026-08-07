/**
 * MVI metadata routes (public).
 *
 * Display config: ../config/mvi.ts
 * Computation config: server/workers/scoring_config.py
 * Keep indicator keys/weights in sync manually.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import {
  MVI_DIMENSIONS,
  MVI_SCORING_VERSION,
  SOURCE_CATALOG,
} from '../config/mvi';
import { apiError, apiResponse } from '../utils/response';

const router = Router();

router.get('/dimensions', async (_req: Request, res: Response) => {
  try {
    const coverageResult = await pool.query<{
      source: string;
      indicator_code: string;
      coverage: string;
      latest_year: string | null;
    }>(
      `
      SELECT
        source,
        indicator_code,
        count(DISTINCT geography_id)::text AS coverage,
        max(year)::text AS latest_year
      FROM raw_indicators
      WHERE value IS NOT NULL
      GROUP BY source, indicator_code
      `
    );

    const coverageMap = new Map<
      string,
      { coverage: number; latestYear: number | null }
    >();
    for (const row of coverageResult.rows) {
      coverageMap.set(`${row.source}::${row.indicator_code}`, {
        coverage: Number(row.coverage),
        latestYear: row.latest_year != null ? Number(row.latest_year) : null,
      });
    }

    const data = MVI_DIMENSIONS.map((dim) => {
      const indicators = dim.indicators.map((ind) => {
        const stats = coverageMap.get(`${ind.source}::${ind.code}`);
        return {
          source: ind.source,
          code: ind.code,
          name: ind.name,
          weight: ind.weight,
          isProxy: Boolean(ind.isProxy),
          coverage: stats?.coverage ?? 0,
          latestYear: stats?.latestYear ?? null,
        };
      });
      const totalCountriesCovered = Math.max(
        0,
        ...indicators.map((i) => i.coverage)
      );
      return {
        key: dim.key,
        label: dim.label,
        description: dim.description,
        indicators,
        totalCountriesCovered,
      };
    });

    res.json(
      apiResponse(data, {
        totalDimensions: data.length,
        scoringVersion: MVI_SCORING_VERSION,
      })
    );
  } catch (err) {
    console.error('[mvi] dimensions error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

router.get('/sources', async (_req: Request, res: Response) => {
  try {
    const statsResult = await pool.query<{
      source: string;
      indicators: string;
      countries: string;
      latest_year: string | null;
      last_ingestion: Date | null;
    }>(
      `
      SELECT
        source,
        count(DISTINCT indicator_code)::text AS indicators,
        count(DISTINCT geography_id)::text AS countries,
        max(year)::text AS latest_year,
        max(fetched_at) AS last_ingestion
      FROM raw_indicators
      GROUP BY source
      ORDER BY source
      `
    );

    const totalsResult = await pool.query<{
      total_indicators: string;
      last_ingestion: Date | null;
    }>(
      `
      SELECT
        count(DISTINCT (source, indicator_code))::text AS total_indicators,
        max(fetched_at) AS last_ingestion
      FROM raw_indicators
      `
    );

    const data = statsResult.rows.map((row) => {
      const meta = SOURCE_CATALOG[row.source] ?? {
        name: row.source,
        url: null,
        refreshCadence: 'Unknown',
      };
      return {
        key: row.source,
        name: meta.name,
        url: meta.url,
        indicators: Number(row.indicators),
        countries: Number(row.countries),
        latestYear: row.latest_year != null ? Number(row.latest_year) : null,
        refreshCadence: meta.refreshCadence,
      };
    });

    res.json(
      apiResponse(data, {
        totalSources: data.length,
        totalIndicators: Number(totalsResult.rows[0]?.total_indicators ?? 0),
        lastIngestion: totalsResult.rows[0]?.last_ingestion
          ? new Date(totalsResult.rows[0].last_ingestion).toISOString()
          : null,
      })
    );
  } catch (err) {
    console.error('[mvi] sources error:', err);
    res.status(500).json(apiError('Internal server error'));
  }
});

export default router;
