import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import Map from '@/components/Map';
import DataFreshnessPill from '@/components/explorer/DataFreshnessPill';
import MviLegend from '@/components/explorer/MviLegend';
import type { MapFlyToTarget } from '@/components/Map.types';
import {
  fetchGeographiesGeojson,
  type GeographyFeatureCollection,
  type GeographyFeatureProperties,
} from '@/services/geographies';

export default function ExplorerScreen() {
  const [geojson, setGeojson] = useState<GeographyFeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Platform.OS === 'web');
  const [selected, setSelected] = useState<GeographyFeatureProperties | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<MapFlyToTarget | null>(null);

  const dataLabel = useMemo(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchGeographiesGeojson()
      .then((fc) => {
        if (!cancelled) {
          setGeojson(fc);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load geographies');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onGeographyClick = useCallback(
    (properties: GeographyFeatureProperties, centroid: [number, number]) => {
      setSelected(properties);
      setFlyToTarget({
        longitude: centroid[0],
        latitude: centroid[1],
        zoom: 4,
      });
    },
    []
  );

  return (
    <View style={styles.container}>
      <Map
        geojson={Platform.OS === 'web' ? geojson : null}
        selectedIsoCode={selected?.isoCode ?? null}
        flyToTarget={flyToTarget}
        onGeographyClick={onGeographyClick}
      />

      {Platform.OS === 'web' ? (
        <>
          <View style={styles.topRight} pointerEvents="box-none">
            <DataFreshnessPill dateLabel={dataLabel} />
          </View>
          <View style={styles.legendWrap} pointerEvents="none">
            <MviLegend />
          </View>
          {loading ? (
            <View style={styles.status} pointerEvents="none">
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.statusText}>Loading geographies…</Text>
            </View>
          ) : null}
          {loadError ? (
            <View style={styles.status} pointerEvents="none">
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          ) : null}
          {selected ? (
            <View style={styles.selectionChip} pointerEvents="none">
              <Text style={styles.selectionName}>{selected.name}</Text>
              <Text style={styles.selectionScore}>
                {selected.overall != null ? `MVI ${selected.overall}` : 'Unscored'}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0b0b12',
  },
  topRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
  },
  legendWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
    zIndex: 2,
  },
  status: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(12,12,20,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 3,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
  },
  errorText: {
    color: '#ff8f8f',
    fontSize: 13,
  },
  selectionChip: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(12,12,20,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 2,
    gap: 2,
  },
  selectionName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectionScore: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
});
