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
  vertical?: string
): Promise<GeographyFeatureCollection> {
  const qs =
    vertical && vertical !== 'all'
      ? `?vertical=${encodeURIComponent(vertical)}`
      : vertical
        ? `?vertical=${encodeURIComponent(vertical)}`
        : '';
  const response = await fetch(`${getApiUrl()}/api/geographies/geojson${qs}`);
  return parseJson<GeographyFeatureCollection>(response);
}

export async function filterGeographies(
  filters: GeographyFilters,
  options?: { limit?: number; vertical?: string }
): Promise<{ data: GeographyListItem[]; total: number }> {
  const response = await fetch(`${getApiUrl()}/api/geographies/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vertical: options?.vertical ?? 'all',
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
