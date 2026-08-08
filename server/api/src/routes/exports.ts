/**
 * Geography export routes (PDF / CSV).
 *
 * GET /api/exports/geography/:id/pdf
 * GET /api/exports/geography/:id/csv
 * GET /api/exports/compare/csv?compare=DEU,SGP,IRL
 */

import { getQuickFacts } from '@gexis/gexis-core';
import { Router, Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { pool } from '../config/database';
import {
  computeWeightedOverall,
  DimensionKey,
  INDUSTRY_VERTICALS,
  MVI_DIMENSIONS,
  MVI_SCORING_VERSION,
  resolveVerticalKey,
  STORED_MVI_VERTICAL,
} from '../config/mvi';
import { optionalAuth } from '../middleware/optionalAuth';
import { requireTier } from '../middleware/requireTier';
import { apiError } from '../utils/response';

const router = Router();

const BASE_DIM_KEYS = MVI_DIMENSIONS.filter((d) => !d.isComposite).map((d) => d.key);

type DimMap = Partial<Record<DimensionKey, number | null>>;

type ExportBundle = {
  id: string;
  name: string;
  isoCode: string | null;
  region: string | null;
  overall: number | null;
  confidence: string | null;
  dataFreshness: string | null;
  vertical: string;
  verticalLabel: string;
  dimensions: DimMap;
  sources: Array<{ source: string; indicator: string; year: number }>;
  quickFacts: {
    population: number | null;
    gdpPpp: number | null;
    corpTaxRate: number | null;
    easeOfBusiness: string | null;
    language: string | null;
    currency: string | null;
  };
  trends: Array<{
    key: string;
    label: string;
    direction: string | null;
    annualizedRate: number | null;
    projected2yr: number | null;
    projected5yr: number | null;
    trendConfidence: string | null;
    dataPoints: number | null;
  }>;
};

function verticalLabel(key: string): string {
  return INDUSTRY_VERTICALS.find((v) => v.key === key)?.label ?? key;
}

function formatDateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function scoreBar(score: number | null, width = 10): string {
  if (score == null || Number.isNaN(score)) return ''.padEnd(width, ' ');
  const filled = Math.max(0, Math.min(width, Math.round((score / 100) * width)));
  // ASCII only — Helvetica/Courier lack block glyphs
  return '#'.repeat(filled).padEnd(width, '.');
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '';
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

async function resolveGeographyId(idOrIso: string): Promise<{
  id: string;
  name: string;
  iso_code: string | null;
  region_label: string | null;
} | null> {
  const isIso = /^[A-Za-z]{3}$/.test(idOrIso);
  const result = await pool.query<{
    id: string;
    name: string;
    iso_code: string | null;
    region_label: string | null;
  }>(
    `
    SELECT id, name, iso_code, region_label
    FROM geographies
    WHERE ${isIso ? 'upper(iso_code) = upper($1)' : 'id = $1::uuid'}
    LIMIT 1
    `,
    [isIso ? idOrIso.toUpperCase() : idOrIso]
  );
  return result.rows[0] ?? null;
}

async function loadQuickFacts(
  geographyId: string,
  isoCode: string | null
): Promise<ExportBundle['quickFacts']> {
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
    [geographyId, ['SP.POP.TOTL', 'imf_gdp_ppp', 'corp_tax_rate', 'RQ.PER.RNK']]
  );
  const byCode = new Map(
    indicators.rows.map((r) => [r.indicator_code, Number(r.value)])
  );

  let easeOfBusiness: string | null = null;
  const rq = byCode.get('RQ.PER.RNK');
  if (rq != null) {
    const rankResult = await pool.query<{ rank: string }>(
      `
      WITH latest_rq AS (
        SELECT DISTINCT ON (geography_id) geography_id, value
        FROM raw_indicators
        WHERE indicator_code = 'RQ.PER.RNK' AND value IS NOT NULL
        ORDER BY geography_id, year DESC
      ),
      ranked AS (
        SELECT geography_id, RANK() OVER (ORDER BY value DESC) AS rank
        FROM latest_rq
      )
      SELECT rank::text FROM ranked WHERE geography_id = $1
      `,
      [geographyId]
    );
    if (rankResult.rows[0]) {
      easeOfBusiness = `#${rankResult.rows[0].rank} globally`;
    }
  }

  return {
    population: byCode.get('SP.POP.TOTL') ?? null,
    gdpPpp: byCode.get('imf_gdp_ppp') ?? null,
    corpTaxRate: byCode.get('corp_tax_rate') ?? null,
    easeOfBusiness,
    language: staticFacts?.language ?? null,
    currency: staticFacts?.currency ?? null,
  };
}

async function loadExportBundle(
  idOrIso: string,
  verticalRaw: unknown
): Promise<ExportBundle | null> {
  const geo = await resolveGeographyId(idOrIso);
  if (!geo) return null;

  const vertical = resolveVerticalKey(verticalRaw);
  const mviResult = await pool.query<{
    overall_score: string | null;
    dimensions: DimMap | null;
    confidence: string | null;
    data_freshness: Date | null;
    sources: unknown;
  }>(
    `
    SELECT overall_score, dimensions, confidence, data_freshness, sources
    FROM mvi_scores
    WHERE geography_id = $1 AND industry_vertical = $2
    LIMIT 1
    `,
    [geo.id, STORED_MVI_VERTICAL]
  );
  const mvi = mviResult.rows[0];
  const dimensions = (mvi?.dimensions ?? {}) as DimMap;
  const overall =
    computeWeightedOverall(dimensions, vertical) ??
    (mvi?.overall_score != null ? Number(mvi.overall_score) : null);

  const trendResult = await pool.query<{
    dimension: string;
    direction: string;
    annualized_rate: string | null;
    projected_2yr: string | null;
    projected_5yr: string | null;
    trend_confidence: string;
    data_points: number;
  }>(
    `
    SELECT dimension, direction, annualized_rate, projected_2yr, projected_5yr,
           trend_confidence, data_points
    FROM trend_scores
    WHERE geography_id = $1
    `,
    [geo.id]
  );
  const trendByDim = new Map(trendResult.rows.map((r) => [r.dimension, r]));
  const trends = BASE_DIM_KEYS.map((key) => {
    const meta = MVI_DIMENSIONS.find((d) => d.key === key);
    const row = trendByDim.get(key);
    return {
      key,
      label: meta?.label ?? key,
      direction: row?.direction ?? null,
      annualizedRate:
        row?.annualized_rate != null ? Number(row.annualized_rate) : null,
      projected2yr:
        row?.projected_2yr != null ? Number(row.projected_2yr) : null,
      projected5yr:
        row?.projected_5yr != null ? Number(row.projected_5yr) : null,
      trendConfidence: row?.trend_confidence ?? null,
      dataPoints: row?.data_points ?? null,
    };
  });

  const sourcesRaw = Array.isArray(mvi?.sources) ? mvi!.sources : [];
  const sources = (sourcesRaw as Array<Record<string, unknown>>)
    .map((s) => ({
      source: String(s.source ?? ''),
      indicator: String(s.indicator ?? ''),
      year: Number(s.year ?? 0),
    }))
    .filter((s) => s.source && s.indicator);

  const quickFacts = await loadQuickFacts(geo.id, geo.iso_code);
  const freshness = mvi?.data_freshness
    ? new Date(mvi.data_freshness).toISOString().slice(0, 10)
    : null;

  return {
    id: geo.id,
    name: geo.name,
    isoCode: geo.iso_code,
    region: geo.region_label,
    overall,
    confidence: mvi?.confidence ?? null,
    dataFreshness: freshness,
    vertical,
    verticalLabel: verticalLabel(vertical),
    dimensions,
    sources,
    quickFacts,
    trends,
  };
}

function csvHeaders(): string[] {
  return [
    'Country',
    'ISO Code',
    'Region',
    'Overall MVI',
    'Confidence',
    'Market Size & Growth',
    'Talent Density',
    'Tax Environment',
    'Regulatory Ease',
    'Infrastructure',
    'Competitor Saturation',
    'Trajectory',
    'Population',
    'GDP PPP',
    'Corp Tax Rate',
    'Ease of Business',
    'Language',
    'Currency',
  ];
}

function bundleToCsvRow(b: ExportBundle): (string | number | null)[] {
  const d = b.dimensions;
  // GDP PPP stored in billions — CSV uses full USD estimate when possible
  const gdpUsd =
    b.quickFacts.gdpPpp != null ? Math.round(b.quickFacts.gdpPpp * 1e9) : null;
  return [
    b.name,
    b.isoCode,
    b.region,
    b.overall != null ? Math.round(b.overall * 100) / 100 : null,
    b.confidence,
    d.marketSizeAndGrowth ?? null,
    d.talentDensity ?? null,
    d.taxEnvironment ?? null,
    d.regulatoryEase ?? null,
    d.infrastructure ?? null,
    d.competitorSaturation ?? null,
    d.trajectory ?? null,
    b.quickFacts.population != null ? Math.round(b.quickFacts.population) : null,
    gdpUsd,
    b.quickFacts.corpTaxRate != null
      ? Math.round(b.quickFacts.corpTaxRate * 100) / 100
      : null,
    b.quickFacts.easeOfBusiness,
    b.quickFacts.language,
    b.quickFacts.currency,
  ];
}

function buildPdf(bundle: ExportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const stamp = formatDateStamp();
    doc.fontSize(18).fillColor('#111').text('GEXIS — Market Viability Report', {
      align: 'left',
    });
    doc.moveDown(0.3);
    doc
      .fontSize(12)
      .fillColor('#333')
      .text(
        `${bundle.name}${bundle.region ? ` · ${bundle.region}` : ''}`,
        { align: 'left' }
      );
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(
        `Generated: ${stamp} · Scoring engine v${MVI_SCORING_VERSION}`,
        { align: 'left' }
      );
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#111').text('MARKET VIABILITY INDEX');
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor('#333')
      .text(
        `Overall Score: ${bundle.overall != null ? Math.round(bundle.overall) : '—'} / 100`
      )
      .text(`Confidence: ${bundle.confidence ?? '—'}`)
      .text(`Industry Vertical: ${bundle.verticalLabel}`)
      .text(`Data Freshness: ${bundle.dataFreshness ?? '—'}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#111').text('DIMENSION SCORES');
    doc.moveDown(0.4);
    doc.font('Courier').fontSize(9).fillColor('#222');
    for (const dim of MVI_DIMENSIONS) {
      const score = bundle.dimensions[dim.key];
      const scoreStr = (score != null ? String(Math.round(score)) : '—').padStart(
        4,
        ' '
      );
      const line = `${dim.label.padEnd(28, ' ')} ${scoreStr}  ${scoreBar(
        score == null ? null : Number(score)
      )}`;
      doc.text(line);
    }
    doc.font('Helvetica');
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#111').text('QUICK FACTS');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#333');
    const qf = bundle.quickFacts;
    const pop =
      qf.population != null
        ? qf.population >= 1e6
          ? `${(qf.population / 1e6).toFixed(1)}M`
          : String(Math.round(qf.population))
        : '—';
    const gdp =
      qf.gdpPpp != null
        ? qf.gdpPpp >= 1000
          ? `$${(qf.gdpPpp / 1000).toFixed(1)}T`
          : `$${qf.gdpPpp.toFixed(1)}B`
        : '—';
    doc
      .text(`Population: ${pop}`)
      .text(`GDP (PPP): ${gdp}`)
      .text(
        `Corp. Tax Rate: ${
          qf.corpTaxRate != null ? `${qf.corpTaxRate.toFixed(1)}%` : '—'
        }`
      )
      .text(`Ease of Business: ${qf.easeOfBusiness ?? '—'}`)
      .text(`Language: ${qf.language ?? '—'}`)
      .text(`Currency: ${qf.currency ?? '—'}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#111').text('TREND ANALYSIS');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#333');
    for (const t of bundle.trends) {
      if (!t.direction) {
        doc.text(`${t.label}: insufficient historical data`);
        continue;
      }
      const rate =
        t.annualizedRate != null
          ? `${t.annualizedRate > 0 ? '+' : ''}${t.annualizedRate.toFixed(2)}/yr`
          : 'n/a';
      doc.text(
        `${t.label}: ${t.direction} (${rate}) · 2yr ${fmtNum(
          t.projected2yr
        )} · 5yr ${fmtNum(t.projected5yr)} · ${t.trendConfidence ?? 'n/a'} confidence` +
          (t.dataPoints != null ? ` · ${t.dataPoints} pts` : '')
      );
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#111').text('DATA SOURCES');
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#444');
    if (bundle.sources.length === 0) {
      doc.text('No source provenance recorded for this geography.');
    } else {
      for (const s of bundle.sources.slice(0, 40)) {
        doc.text(`${s.source} · ${s.indicator} · ${s.year}`);
      }
      if (bundle.sources.length > 40) {
        doc.text(`… and ${bundle.sources.length - 40} more`);
      }
    }

    doc.moveDown(1.5);
    doc
      .fontSize(8)
      .fillColor('#888')
      .text(
        'Generated by GEXIS · gexis.io · MVI methodology: gexis.io/docs/methodology',
        { align: 'center' }
      );

    doc.end();
  });
}

/** GET /api/exports/geography/:id/pdf */
router.get('/geography/:id/pdf', optionalAuth, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const bundle = await loadExportBundle(id, req.query.vertical);
    if (!bundle) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }
    const pdf = await buildPdf(bundle);
    const iso = bundle.isoCode ?? 'GEO';
    const filename = `GEXIS_${iso}_${formatDateStamp()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(pdf);
  } catch (err) {
    console.error('[exports] pdf error:', err);
    res.status(500).json(apiError('Failed to generate PDF'));
  }
});

/** GET /api/exports/geography/:id/csv */
router.get('/geography/:id/csv', optionalAuth, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const bundle = await loadExportBundle(id, req.query.vertical);
    if (!bundle) {
      res.status(404).json(apiError('Geography not found'));
      return;
    }
    const csv = stringify([csvHeaders(), bundleToCsvRow(bundle)]);
    const iso = bundle.isoCode ?? 'GEO';
    const filename = `GEXIS_${iso}_${formatDateStamp()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(csv);
  } catch (err) {
    console.error('[exports] csv error:', err);
    res.status(500).json(apiError('Failed to generate CSV'));
  }
});

/** GET /api/exports/compare/csv?compare=DEU,SGP,IRL */
router.get('/compare/csv', optionalAuth, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.compare ?? '').trim();
    const isos = [
      ...new Set(
        raw
          .split(/[,+]/)
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z]{3}$/.test(s))
      ),
    ].slice(0, 10);
    if (isos.length === 0) {
      res.status(400).json(apiError('compare must include at least one ISO code'));
      return;
    }

    const rows: (string | number | null)[][] = [csvHeaders()];
    for (const iso of isos) {
      const bundle = await loadExportBundle(iso, req.query.vertical);
      if (bundle) rows.push(bundleToCsvRow(bundle));
    }
    if (rows.length === 1) {
      res.status(404).json(apiError('No matching geographies found'));
      return;
    }

    const csv = stringify(rows);
    const filename = `GEXIS_compare_${isos.join('-')}_${formatDateStamp()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(csv);
  } catch (err) {
    console.error('[exports] compare csv error:', err);
    res.status(500).json(apiError('Failed to generate comparison CSV'));
  }
});

export default router;
