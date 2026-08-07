import type { GeographyFeatureCollection, GeographyFeatureProperties } from '@/services/geographies';

export type MapFlyToTarget = {
  longitude: number;
  latitude: number;
  zoom?: number;
};

export type MapProps = {
  style?: object;
  /** Choropleth FeatureCollection (web). */
  geojson?: GeographyFeatureCollection | null;
  /** ISO codes that match current filters; null = all match. */
  matchedIsoCodes?: Set<string> | null;
  selectedIsoCode?: string | null;
  flyToTarget?: MapFlyToTarget | null;
  onGeographyHover?: (isoCode: string | null) => void;
  onGeographyClick?: (
    properties: GeographyFeatureProperties,
    centroid: [number, number]
  ) => void;
};
