/** MVI choropleth palette — cool-to-warm, mapped to observed score range. */

export const MVI_NULL_FILL = '#1a1a2e';
export const MVI_BORDER = '#2a2a3e';
export const MVI_BORDER_HOVER = '#c8c8d8';

/** Observed Phase-4 score band (compute_mvi ~20–75; keep slight pad from Phase 3). */
export const MVI_SCORE_MIN = 18;
export const MVI_SCORE_MAX = 76;

export const MVI_COLOR_STOPS: Array<[number, string]> = [
  [18, '#1e3a5f'],
  [32, '#1a6b5a'],
  [47, '#7a7a2e'],
  [62, '#c4651a'],
  [76, '#d93025'],
];

export function mviScoreColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return MVI_NULL_FILL;
  const s = Math.max(MVI_SCORE_MIN, Math.min(MVI_SCORE_MAX, score));
  for (let i = 0; i < MVI_COLOR_STOPS.length - 1; i++) {
    const [aScore, aColor] = MVI_COLOR_STOPS[i];
    const [bScore, bColor] = MVI_COLOR_STOPS[i + 1];
    if (s <= bScore) {
      if (s <= aScore) return aColor;
      const t = (s - aScore) / (bScore - aScore);
      return lerpHex(aColor, bColor, t);
    }
  }
  return MVI_COLOR_STOPS[MVI_COLOR_STOPS.length - 1][1];
}

function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Mapbox fill-color expression for GeoJSON property `overall`. */
export function mviFillColorExpression(): unknown[] {
  const interpolate: unknown[] = ['interpolate', ['linear'], ['get', 'overall']];
  for (const [score, color] of MVI_COLOR_STOPS) {
    interpolate.push(score, color);
  }
  return [
    'case',
    [
      'any',
      ['!', ['has', 'overall']],
      ['==', ['get', 'overall'], null],
      ['==', ['typeof', ['get', 'overall']], 'null'],
    ],
    MVI_NULL_FILL,
    interpolate,
  ];
}

/**
 * Native choropleth fill-color using `overallScore` (with `overall` fallback),
 * matching the Mapbox style-spec stops used on device.
 */
export function mviFillColorExpressionNative(): unknown[] {
  const scoreExpr: unknown[] = [
    'coalesce',
    ['get', 'overallScore'],
    ['get', 'overall'],
  ];
  return [
    'case',
    [
      'any',
      [
        'all',
        ['!', ['has', 'overallScore']],
        ['!', ['has', 'overall']],
      ],
      ['==', ['get', 'overallScore'], null],
      ['==', ['typeof', ['get', 'overallScore']], 'null'],
      [
        'all',
        ['==', ['typeof', ['get', 'overallScore']], 'null'],
        ['==', ['get', 'overall'], null],
      ],
    ],
    MVI_NULL_FILL,
    [
      'interpolate',
      ['linear'],
      scoreExpr,
      20,
      '#1e3a5f',
      35,
      '#1a6b5a',
      50,
      '#7a7a2e',
      65,
      '#c4651a',
      76,
      '#d93025',
    ],
  ];
}

export const MVI_LEGEND_GRADIENT = `linear-gradient(90deg, ${MVI_COLOR_STOPS.map(
  ([, c]) => c
).join(', ')})`;
