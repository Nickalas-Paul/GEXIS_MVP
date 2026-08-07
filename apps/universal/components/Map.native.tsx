import { DEFAULT_MAP_STYLE, DEFAULT_MAP_VIEWPORT } from '@gexis/gexis-core';
import MapboxGL from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MVI_BORDER, mviFillColorExpressionNative } from '@/lib/mviColors';
import {
  geometryCentroid,
  type GeographyFeatureProperties,
} from '@/services/geographies';

import type { MapProps } from './Map.types';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const SOURCE_ID = 'mvi-geographies';
const FILL_LAYER_ID = 'mvi-choropleth-fill';
const LINE_LAYER_ID = 'mvi-choropleth-line';

if (token) {
  void MapboxGL.setAccessToken(token);
}

export default function Map({
  style,
  geojson = null,
  matchedIsoCodes = null,
  selectedIsoCode = null,
  flyToTarget = null,
  onGeographyClick,
}: MapProps) {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const fillColor = useMemo(() => mviFillColorExpressionNative(), []);

  useEffect(() => {
    console.log(
      '[Map.native] geojson prop:',
      geojson ? geojson.features.length + ' features' : 'null'
    );
    console.log(
      '[Map.native] matchedIsoCodes:',
      matchedIsoCodes ? matchedIsoCodes.size + ' codes' : 'null'
    );
  }, [geojson, matchedIsoCodes]);

  const fillOpacity = useMemo(() => {
    const matchedList = matchedIsoCodes ? Array.from(matchedIsoCodes) : null;
    if (matchedList == null) return 0.7;
    return [
      'case',
      ['in', ['get', 'isoCode'], ['literal', matchedList]],
      0.7,
      0.15,
    ] as unknown[];
  }, [matchedIsoCodes]);

  const lineWidth = useMemo(
    () =>
      [
        'case',
        ['==', ['get', 'isoCode'], selectedIsoCode ?? ''],
        1.5,
        0.5,
      ] as unknown[],
    [selectedIsoCode]
  );

  useEffect(() => {
    if (!flyToTarget) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [flyToTarget.longitude, flyToTarget.latitude],
      zoomLevel: flyToTarget.zoom ?? 4,
      animationDuration: 900,
    });
  }, [flyToTarget]);

  if (!token) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackTitle}>Map unavailable</Text>
        <Text style={styles.fallbackCopy}>
          Set EXPO_PUBLIC_MAPBOX_TOKEN in apps/universal/.env to render the Mapbox base map.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapboxGL.MapView style={styles.map} styleURL={DEFAULT_MAP_STYLE}>
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [
              DEFAULT_MAP_VIEWPORT.longitude,
              DEFAULT_MAP_VIEWPORT.latitude,
            ],
            zoomLevel: DEFAULT_MAP_VIEWPORT.zoom,
          }}
        />
        {geojson ? (
          <MapboxGL.ShapeSource
            id={SOURCE_ID}
            shape={geojson}
            onPress={(event) => {
              const feature = event.features?.[0];
              if (!feature?.properties) return;
              const props = feature.properties as GeographyFeatureProperties;
              const normalized: GeographyFeatureProperties = {
                ...props,
                overall:
                  props.overall == null &&
                  (props as { overallScore?: number | null }).overallScore == null
                    ? null
                    : Number(
                        props.overall ??
                          (props as { overallScore?: number | null }).overallScore
                      ),
                population:
                  props.population == null ? null : Number(props.population),
                marketSizeAndGrowth:
                  props.marketSizeAndGrowth == null
                    ? null
                    : Number(props.marketSizeAndGrowth),
                talentDensity:
                  props.talentDensity == null
                    ? null
                    : Number(props.talentDensity),
                taxEnvironment:
                  props.taxEnvironment == null
                    ? null
                    : Number(props.taxEnvironment),
                regulatoryEase:
                  props.regulatoryEase == null
                    ? null
                    : Number(props.regulatoryEase),
                infrastructure:
                  props.infrastructure == null
                    ? null
                    : Number(props.infrastructure),
                competitorSaturation:
                  props.competitorSaturation == null
                    ? null
                    : Number(props.competitorSaturation),
              };
              const centroid =
                geometryCentroid(feature.geometry) ??
                ([
                  DEFAULT_MAP_VIEWPORT.longitude,
                  DEFAULT_MAP_VIEWPORT.latitude,
                ] as [number, number]);
              // eslint-disable-next-line no-console
              console.log(
                '[Map.native] tapped',
                normalized.name,
                'MVI',
                normalized.overall
              );
              onGeographyClick?.(normalized, centroid);
            }}
          >
            <MapboxGL.FillLayer
              id={FILL_LAYER_ID}
              style={{
                fillColor: fillColor as never,
                fillOpacity: fillOpacity as never,
              }}
            />
            <MapboxGL.LineLayer
              id={LINE_LAYER_ID}
              style={{
                lineColor: MVI_BORDER,
                lineWidth: lineWidth as never,
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 320,
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#1a1a1a',
    gap: 8,
  },
  fallbackTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  fallbackCopy: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 360,
  },
});
