/** Shared map viewport / style config for web and native map surfaces. */

export interface MapViewport {
  /** Longitude in degrees (WGS84). */
  longitude: number;
  /** Latitude in degrees (WGS84). */
  latitude: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

/** Default world view: center [lng, lat] = [0, 20], zoom 1.8 */
export const DEFAULT_MAP_VIEWPORT: MapViewport = {
  longitude: 0,
  latitude: 20,
  zoom: 1.8,
  bearing: 0,
  pitch: 0,
};

/** Dark basemap matching product mockups. */
export const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
