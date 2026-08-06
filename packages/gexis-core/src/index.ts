export interface Geography {
  id: string;
  name: string;
  regionType: "country" | "state" | "metro" | "municipality";
  geometry: GeoJSON.Geometry;
  mviScore?: number;
}

export interface MVIScore {
  overall: number;
  dimensions: {
    marketSizeAndGrowth: number;
    talentDensity: number;
    taxEnvironment: number;
    regulatoryEase: number;
    infrastructure: number;
    competitorSaturation: number;
  };
  confidence: "high" | "medium" | "low";
  lastUpdated: string;
}

export const MVI_VERSION = "0.1.0";

export {
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_VIEWPORT,
  type MapViewport,
} from "./mapConfig";
