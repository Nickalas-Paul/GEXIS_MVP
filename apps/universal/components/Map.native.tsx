import { DEFAULT_MAP_STYLE, DEFAULT_MAP_VIEWPORT } from '@gexis/gexis-core';
import MapboxGL from '@rnmapbox/maps';
import { StyleSheet, Text, View } from 'react-native';

import type { MapProps } from './Map.types';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

if (token) {
  void MapboxGL.setAccessToken(token);
}

export default function Map({ style }: MapProps) {
  // Choropleth / filter props are web-only (Map.web.tsx).
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
          defaultSettings={{
            centerCoordinate: [DEFAULT_MAP_VIEWPORT.longitude, DEFAULT_MAP_VIEWPORT.latitude],
            zoomLevel: DEFAULT_MAP_VIEWPORT.zoom,
          }}
        />
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
