import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import Map from '@/components/Map';
import DataFreshnessPill from '@/components/explorer/DataFreshnessPill';
import FilterSidebar from '@/components/explorer/FilterSidebar';
import GeographyDrillDown from '@/components/explorer/GeographyDrillDown';
import MviLegend from '@/components/explorer/MviLegend';
import TopMatchesList from '@/components/explorer/TopMatchesList';
import type { MapFlyToTarget } from '@/components/Map.types';
import { useExplorerFilters } from '@/hooks/useExplorerFilters';
import {
  fetchGeographiesGeojson,
  type GeographyFeatureCollection,
  type GeographyFeatureProperties,
  type GeographyListItem,
} from '@/services/geographies';

const DESKTOP_BREAKPOINT = 768;

export default function ExplorerScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const {
    filters,
    updateFilters,
    resetFilters,
    matched,
    matchedIsoCodes,
    filtering,
  } = useExplorerFilters();

  const [geojson, setGeojson] = useState<GeographyFeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Platform.OS === 'web');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<MapFlyToTarget | null>(null);

  const dataLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  const selectGeography = useCallback(
    (opts: {
      idOrIso: string;
      isoCode?: string | null;
      centroid?: [number, number] | null;
      zoom?: number;
    }) => {
      setSelectedKey(opts.idOrIso);
      setSelectedIso(opts.isoCode ?? opts.idOrIso);
      if (opts.centroid) {
        setFlyToTarget({
          longitude: opts.centroid[0],
          latitude: opts.centroid[1],
          zoom: opts.zoom ?? 4,
        });
      }
    },
    []
  );

  const onGeographyClick = useCallback(
    (properties: GeographyFeatureProperties, centroid: [number, number]) => {
      const key = properties.isoCode ?? properties.id;
      selectGeography({
        idOrIso: key,
        isoCode: properties.isoCode,
        centroid,
      });
    },
    [selectGeography]
  );

  const onMatchSelect = useCallback(
    (item: GeographyListItem) => {
      const centroid =
        item.centroid != null
          ? ([item.centroid.lng, item.centroid.lat] as [number, number])
          : null;
      selectGeography({
        idOrIso: item.isoCode ?? item.id,
        isoCode: item.isoCode,
        centroid,
      });
    },
    [selectGeography]
  );

  const showFilters = Platform.OS === 'web' && isDesktop;
  const showDrillDown = Platform.OS === 'web' && isDesktop && selectedKey != null;

  return (
    <View style={styles.container}>
      {showFilters ? (
        <View style={styles.leftRail}>
          <FilterSidebar
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            style={styles.filtersInRail}
          />
          <TopMatchesList
            items={matched}
            selectedIsoCode={selectedIso}
            onSelect={onMatchSelect}
          />
        </View>
      ) : null}

      <View style={styles.mapPane}>
        <Map
          geojson={Platform.OS === 'web' ? geojson : null}
          matchedIsoCodes={Platform.OS === 'web' ? matchedIsoCodes : null}
          selectedIsoCode={selectedIso}
          flyToTarget={flyToTarget}
          onGeographyClick={onGeographyClick}
        />

        {Platform.OS === 'web' ? (
          <>
            <View style={styles.topRight} pointerEvents="box-none">
              <DataFreshnessPill dateLabel={dataLabel} />
              {filtering ? (
                <Text style={styles.filteringHint}>Updating filters…</Text>
              ) : null}
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
          </>
        ) : null}
      </View>

      {showDrillDown ? (
        <GeographyDrillDown
          geographyIdOrIso={selectedKey}
          onClose={() => {
            setSelectedKey(null);
            setSelectedIso(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0b0b12',
  },
  leftRail: {
    width: 280,
    backgroundColor: '#0e0e16',
    borderRightWidth: 1,
    borderRightColor: '#1c1c2a',
    flexDirection: 'column',
  },
  filtersInRail: {
    width: '100%',
    borderRightWidth: 0,
  },
  mapPane: {
    flex: 1,
    position: 'relative',
  },
  topRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    alignItems: 'flex-end',
    gap: 8,
  },
  filteringHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
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
});
