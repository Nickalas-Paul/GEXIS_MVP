import { DEFAULT_MAP_STYLE, DEFAULT_MAP_VIEWPORT } from '@gexis/gexis-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapGL, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import {
  MVI_BORDER,
  MVI_BORDER_HOVER,
  mviFillColorExpression,
} from '@/lib/mviColors';
import {
  geometryCentroid,
  type GeographyFeatureProperties,
} from '@/services/geographies';

import type { MapProps } from './Map.types';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const FILL_LAYER_ID = 'mvi-choropleth-fill';
const LINE_LAYER_ID = 'mvi-choropleth-line';
const SOURCE_ID = 'mvi-geographies';

export default function Map({
  style,
  geojson,
  matchedIsoCodes = null,
  selectedIsoCode = null,
  flyToTarget = null,
  onGeographyHover,
  onGeographyClick,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const [viewState, setViewState] = useState(DEFAULT_MAP_VIEWPORT);
  const [cursor, setCursor] = useState<'default' | 'pointer'>('default');

  const fillColor = useMemo(() => mviFillColorExpression(), []);

  const fillOpacityExpression = useMemo(() => {
    const matchedList = matchedIsoCodes ? Array.from(matchedIsoCodes) : null;
    return [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.9,
      matchedList == null
        ? 0.7
        : [
            'case',
            ['in', ['get', 'isoCode'], ['literal', matchedList]],
            0.7,
            0.15,
          ],
    ];
  }, [matchedIsoCodes]);

  const lineWidthExpression = useMemo(
    () => [
      'case',
      [
        'any',
        ['boolean', ['feature-state', 'hover'], false],
        ['==', ['get', 'isoCode'], selectedIsoCode ?? ''],
      ],
      1.5,
      0.5,
    ],
    [selectedIsoCode]
  );

  const lineColorExpression = useMemo(
    () => [
      'case',
      [
        'any',
        ['boolean', ['feature-state', 'hover'], false],
        ['==', ['get', 'isoCode'], selectedIsoCode ?? ''],
      ],
      MVI_BORDER_HOVER,
      MVI_BORDER,
    ],
    [selectedIsoCode]
  );

  useEffect(() => {
    if (!flyToTarget) return;
    mapRef.current?.flyTo({
      center: [flyToTarget.longitude, flyToTarget.latitude],
      zoom: flyToTarget.zoom ?? 4,
      duration: 900,
    });
  }, [flyToTarget]);

  const clearHover = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && hoveredIdRef.current != null) {
      try {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
      } catch {
        // source may not be ready
      }
      hoveredIdRef.current = null;
    }
    setCursor('default');
    onGeographyHover?.(null);
  }, [onGeographyHover]);

  const onMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const feature = event.features?.[0];
      const iso =
        (feature?.properties?.isoCode as string | undefined) ??
        (feature?.id != null ? String(feature.id) : null);

      if (!iso) {
        clearHover();
        return;
      }

      if (hoveredIdRef.current !== iso) {
        if (hoveredIdRef.current != null) {
          try {
            map.setFeatureState(
              { source: SOURCE_ID, id: hoveredIdRef.current },
              { hover: false }
            );
          } catch {
            // ignore
          }
        }
        hoveredIdRef.current = iso;
        try {
          map.setFeatureState({ source: SOURCE_ID, id: iso }, { hover: true });
        } catch {
          // ignore
        }
        onGeographyHover?.(iso);
      }
      setCursor('pointer');
    },
    [clearHover, onGeographyHover]
  );

  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature?.properties || !onGeographyClick) return;
      const props = feature.properties as GeographyFeatureProperties;
      // GeoJSON from API may stringify numbers; normalize
      const normalized: GeographyFeatureProperties = {
        ...props,
        overall:
          props.overall == null || props.overall === ('' as unknown)
            ? null
            : Number(props.overall),
        population:
          props.population == null ? null : Number(props.population),
        marketSizeAndGrowth:
          props.marketSizeAndGrowth == null
            ? null
            : Number(props.marketSizeAndGrowth),
        talentDensity:
          props.talentDensity == null ? null : Number(props.talentDensity),
        taxEnvironment:
          props.taxEnvironment == null ? null : Number(props.taxEnvironment),
        regulatoryEase:
          props.regulatoryEase == null ? null : Number(props.regulatoryEase),
        infrastructure:
          props.infrastructure == null ? null : Number(props.infrastructure),
        competitorSaturation:
          props.competitorSaturation == null
            ? null
            : Number(props.competitorSaturation),
        trajectory:
          props.trajectory == null ? null : Number(props.trajectory),
      };
      const centroid =
        geometryCentroid(feature.geometry) ??
        ([event.lngLat.lng, event.lngLat.lat] as [number, number]);
      onGeographyClick(normalized, centroid);
    },
    [onGeographyClick]
  );

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
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapboxAccessToken={token}
        mapStyle={DEFAULT_MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        reuseMaps
        cursor={cursor}
        interactiveLayerIds={geojson ? [FILL_LAYER_ID] : []}
        onMouseMove={onMouseMove}
        onMouseLeave={clearHover}
        onClick={onClick}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {geojson ? (
          <Source
            id={SOURCE_ID}
            type="geojson"
            data={geojson}
            promoteId="isoCode"
          >
            <Layer
              id={FILL_LAYER_ID}
              type="fill"
              paint={{
                'fill-color': fillColor as never,
                'fill-opacity': fillOpacityExpression as never,
              }}
            />
            <Layer
              id={LINE_LAYER_ID}
              type="line"
              paint={{
                'line-color': lineColorExpression as never,
                'line-width': lineWidthExpression as never,
              }}
            />
          </Source>
        ) : null}
      </MapGL>
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
