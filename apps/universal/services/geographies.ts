import { getApiUrl } from '@/services/api';

export type GeographyFeatureProperties = {
  id: string;
  name: string;
  isoCode: string | null;
  overall: number | null;
  marketSizeAndGrowth: number | null;
  talentDensity: number | null;
  taxEnvironment: number | null;
  regulatoryEase: number | null;
  infrastructure: number | null;
  competitorSaturation: number | null;
  trajectory: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  population: number | null;
};

export type GeographyFeature = GeoJSON.Feature<
  GeoJSON.Geometry,
  GeographyFeatureProperties
> & {
  id?: string | number;
};

export type GeographyFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeographyFeatureProperties
>;

export type GeographyListItem = {
  id: string;
  name: string;
  isoCode: string | null;
  regionType: string;
  region: string | null;
  centroid: { lat: number; lng: number } | null;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  population: number | null;
  gdpPpp: number | null;
  mvi: {
    overall: number | null;
    dimensions: {
      marketSizeAndGrowth: number | null;
      talentDensity: number | null;
      taxEnvironment: number | null;
      regulatoryEase: number | null;
      infrastructure: number | null;
      competitorSaturation: number | null;
      trajectory: number | null;
    } | null;
    confidence: 'high' | 'medium' | 'low' | null;
    dataFreshness: string | null;
    calculatedAt: string | null;
    sources?: unknown;
  } | null;
};

export type GeographyFilters = {
  minPopulation?: number;
  maxCorpTaxRate?: number;
  minTalentDensity?: number;
  maxCompetitorSaturation?: number;
  minRegulatoryEase?: number;
};

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchGeographiesGeojson(
  vertical?: string,
  horizon?: '2yr' | '5yr' | 'current' | null
): Promise<GeographyFeatureCollection> {
  const params = new URLSearchParams();
  if (vertical) params.set('vertical', vertical);
  if (horizon === '2yr' || horizon === '5yr') params.set('horizon', horizon);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${getApiUrl()}/api/geographies/geojson${qs}`);
  return parseJson<GeographyFeatureCollection>(response);
}

/** List countries from GET /api/geographies (defaults to region_type=country). */
export async function listCountries(): Promise<
  Array<{ id: string; name: string; isoCode: string | null }>
> {
  const response = await fetch(`${getApiUrl()}/api/geographies`);
  const json = await parseJson<ApiEnvelope<GeographyListItem[]>>(response);
  return (json.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    isoCode: g.isoCode,
  }));
}

export async function filterGeographies(
  filters: GeographyFilters,
  options?: {
    limit?: number;
    vertical?: string;
    horizon?: '2yr' | '5yr';
  }
): Promise<{ data: GeographyListItem[]; total: number }> {
  const response = await fetch(`${getApiUrl()}/api/geographies/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vertical: options?.vertical ?? 'all',
      horizon: options?.horizon,
      filters,
      sort: { field: 'overall', direction: 'desc' },
      limit: options?.limit ?? 200,
    }),
  });
  const json = await parseJson<ApiEnvelope<GeographyListItem[]>>(response);
  return {
    data: json.data ?? [],
    total: Number(json.meta?.total ?? json.data?.length ?? 0),
  };
}

export async function fetchGeographyById(
  idOrIso: string,
  vertical?: string
): Promise<GeographyListItem> {
  const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
  const response = await fetch(
    `${getApiUrl()}/api/geographies/${encodeURIComponent(idOrIso)}${qs}`
  );
  const json = await parseJson<ApiEnvelope<GeographyListItem>>(response);
  return json.data;
}

export type QuickFacts = {
  population: number | null;
  gdpPpp: number | null;
  corpTaxRate: number | null;
  regulatoryQuality: number | null;
  easeOfBusiness: string | null;
  language: string | null;
  currency: string | null;
};

export type MviSourceRef = {
  year: number;
  source: string;
  indicator: string;
};

export type GeographyDetail = {
  id: string;
  name: string;
  isoCode: string | null;
  regionType: string;
  region: string | null;
  centroid: { lat: number; lng: number } | null;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  population: number | null;
  gdpPpp: number | null;
  geometry: GeoJSON.Geometry | null;
  mvi: {
    overall: number | null;
    dimensions: {
      marketSizeAndGrowth: number | null;
      talentDensity: number | null;
      taxEnvironment: number | null;
      regulatoryEase: number | null;
      infrastructure: number | null;
      competitorSaturation: number | null;
      trajectory: number | null;
    } | null;
    confidence: 'high' | 'medium' | 'low' | null;
    dataFreshness: string | null;
    calculatedAt: string | null;
    vertical: string;
    sources: MviSourceRef[];
  } | null;
  quickFacts: QuickFacts | null;
};

/** Fetch single geography with full MVI breakdown and Quick Facts. */
export async function getGeographyDetail(
  id: string,
  vertical?: string
): Promise<GeographyDetail> {
  const params = new URLSearchParams();
  if (vertical) params.set('vertical', vertical);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(
    `${getApiUrl()}/api/geographies/${encodeURIComponent(id)}${qs}`
  );
  const json = await parseJson<ApiEnvelope<GeographyDetail>>(response);
  const data = json.data;
  // Normalize sources array (API may omit on sparse rows)
  if (data.mvi && !Array.isArray(data.mvi.sources)) {
    data.mvi.sources = [];
  }
  return data;
}

export type DimensionTrend = {
  direction: 'improving' | 'declining' | 'stable';
  annualizedRate: number | null;
  acceleration: number | null;
  currentScore: number | null;
  projected2yr: number | null;
  projected5yr: number | null;
  confidence: {
    lower2yr: number | null;
    upper2yr: number | null;
    lower5yr: number | null;
    upper5yr: number | null;
  };
  trendConfidence: 'high' | 'medium' | 'low';
  dataPoints: number;
  yearRange: [number, number] | null;
  /** Year-by-year dimension scores for sparklines (optional until API ships it). */
  historicalScores?: Array<{ year: number; score: number }>;
};

export type TrendData = {
  isoCode: string | null;
  name: string;
  trends: Record<string, DimensionTrend | null>;
};

/** Fetch per-dimension trend vectors (6 base dimensions; Trajectory is composite). */
export async function getGeographyTrends(
  id: string
): Promise<TrendData | null> {
  const response = await fetch(
    `${getApiUrl()}/api/geographies/${encodeURIComponent(id)}/trends`
  );
  if (response.status === 404) return null;
  const json = await parseJson<ApiEnvelope<TrendData>>(response);
  return json.data ?? null;
}

/** Approximate centroid from a GeoJSON geometry (bbox midpoint). */
export function geometryCentroid(
  geometry: GeoJSON.Geometry | null | undefined
): [number, number] | null {
  if (!geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as [number, number];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    for (const c of coords) visit(c);
  };

  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) visit((g as GeoJSON.Geometry & { coordinates?: unknown }).coordinates);
  } else if ('coordinates' in geometry) {
    visit(geometry.coordinates);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}
