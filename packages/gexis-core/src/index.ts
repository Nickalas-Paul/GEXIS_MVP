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
    trajectory: number;
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

export {
  COUNTRY_QUICK_FACTS,
  getQuickFacts,
  type CountryQuickFacts,
} from "./quickFacts";

export {
  MVI_DIMENSION_DISPLAY,
  SOURCE_DISPLAY_NAMES,
  MVI_SOURCE_CATALOG,
  MVI_SCORING_VERSION_LABEL,
  getDimensionDisplay,
  sourceDisplayName,
  formatNormalization,
  formatDirection,
  type DimensionKey,
  type DimensionDisplay,
  type IndicatorDisplay,
  type IndicatorDirection,
  type IndicatorNormalization,
  type SourceCatalogEntry,
} from "./mviDisplay";

export {
  ALL_FILTER_KEYS,
  ALL_HORIZONS,
  FREE_FILTER_KEYS,
  GATING_ENABLED,
  TIER_FEATURES,
  canAccessFeature,
  canUseFilter,
  canUseHorizon,
  getAvailableFilters,
  isGatingEnabled,
  type FilterKey,
  type SubscriptionTier,
  type TierFeature,
  type TierFeatureMap,
  type TimeHorizon,
} from "./tiers";

// Agents
export * from "./agents";

// Industry Verticals
export * from "./verticals";

// Market Signals (Layer 2)
export {
  type MarketSignal,
  type SignalDirection,
  type SignalSummaryMap,
} from "./signals";
