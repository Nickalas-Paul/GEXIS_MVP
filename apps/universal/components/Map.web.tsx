import { DEFAULT_MAP_STYLE, DEFAULT_MAP_VIEWPORT } from '@gexis/gexis-core';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapGL, { NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import type { MapProps } from './Map.types';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export default function Map({ style }: MapProps) {
  const [viewState, setViewState] = useState(DEFAULT_MAP_VIEWPORT);

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
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapboxAccessToken={token}
        mapStyle={DEFAULT_MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
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
