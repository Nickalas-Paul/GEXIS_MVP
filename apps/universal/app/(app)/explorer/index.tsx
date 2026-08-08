import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import Map from '@/components/Map';
import BottomSheet from '@/components/explorer/BottomSheet';
import DataFreshnessPill from '@/components/explorer/DataFreshnessPill';
import FilterSidebar from '@/components/explorer/FilterSidebar';
import GeographyDrillDown from '@/components/explorer/GeographyDrillDown';
import GeographySearch, {
  type SearchResult,
} from '@/components/explorer/GeographySearch';
import MviLegend from '@/components/explorer/MviLegend';
import TopMatchesList from '@/components/explorer/TopMatchesList';
import type { MapFlyToTarget } from '@/components/Map.types';
import { useExplorerFilters } from '@/hooks/useExplorerFilters';
import {
  fetchGeographiesGeojson,
  geometryCentroid,
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
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<MapFlyToTarget | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'filters' | 'matches'>('filters');

  const dataLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchGeographiesGeojson(filters.industryVertical)
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
  }, [filters.industryVertical]);

  const selectGeography = useCallback(
    (opts: {
      idOrIso: string;
      isoCode?: string | null;
      centroid?: [number, number] | null;
      zoom?: number;
    }) => {
      setSelectedKey(opts.idOrIso);
      setSelectedIso(opts.isoCode ?? opts.idOrIso);
      setFiltersOpen(false);
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

  const onSearchSelect = useCallback(
    (result: SearchResult) => {
      const feature = geojson?.features.find(
        (f) => f.properties?.id === result.id || f.properties?.isoCode === result.isoCode
      );
      const centroid = feature ? geometryCentroid(feature.geometry) : null;
      selectGeography({
        idOrIso: result.isoCode ?? result.id,
        isoCode: result.isoCode,
        centroid,
      });
    },
    [geojson, selectGeography]
  );

  const closeSelection = useCallback(() => {
    setSelectedKey(null);
    setSelectedIso(null);
  }, []);

  const isWeb = Platform.OS === 'web';
  const showDesktopChrome = isWeb && isDesktop;
  const showMobileChrome = !isDesktop;

  return (
    <View style={styles.container}>
      {showDesktopChrome ? (
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
          geojson={geojson}
          matchedIsoCodes={matchedIsoCodes}
          selectedIsoCode={selectedIso}
          flyToTarget={flyToTarget}
          onGeographyClick={onGeographyClick}
        />

        <>
            <View
              style={StyleSheet.flatten([
                styles.searchWrap,
                showMobileChrome && styles.searchWrapMobile,
              ])}
              pointerEvents="box-none"
            >
              <GeographySearch geojson={geojson} onSelect={onSearchSelect} />
            </View>

            <View style={styles.topRight} pointerEvents="box-none">
              <DataFreshnessPill dateLabel={dataLabel} />
              {filtering ? (
                <Text style={styles.filteringHint}>Updating filters…</Text>
              ) : null}
            </View>

            {showMobileChrome ? (
              <Pressable
                style={styles.mobileFilterBtn}
                onPress={() => setFiltersOpen(true)}
              >
                <Text style={styles.mobileFilterBtnText}>Filters</Text>
              </Pressable>
            ) : null}

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
      </View>

      {showDesktopChrome && selectedKey ? (
        <GeographyDrillDown
          geographyIdOrIso={selectedKey}
          vertical={filters.industryVertical}
          onClose={closeSelection}
        />
      ) : null}

      {/* Mobile / native filter / matches sheet */}
      {showMobileChrome ? (
        <BottomSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title="EXPLORE"
          height="78%"
        >
          <View style={styles.mobileTabs}>
            <Pressable
              style={StyleSheet.flatten([
                styles.mobileTab,
                mobileTab === 'filters' && styles.mobileTabActive,
              ])}
              onPress={() => setMobileTab('filters')}
            >
              <Text
                style={StyleSheet.flatten([
                  styles.mobileTabText,
                  mobileTab === 'filters' && styles.mobileTabTextActive,
                ])}
              >
                Filters
              </Text>
            </Pressable>
            <Pressable
              style={StyleSheet.flatten([
                styles.mobileTab,
                mobileTab === 'matches' && styles.mobileTabActive,
              ])}
              onPress={() => setMobileTab('matches')}
            >
              <Text
                style={StyleSheet.flatten([
                  styles.mobileTabText,
                  mobileTab === 'matches' && styles.mobileTabTextActive,
                ])}
              >
                Top Matches
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.mobileSheetScroll}
            contentContainerStyle={styles.mobileSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {mobileTab === 'filters' ? (
              <FilterSidebar
                filters={filters}
                onChange={updateFilters}
                onReset={resetFilters}
                style={styles.mobileFilters}
              />
            ) : (
              <TopMatchesList
                items={matched}
                selectedIsoCode={selectedIso}
                onSelect={onMatchSelect}
                style={styles.mobileMatches}
              />
            )}
          </ScrollView>
        </BottomSheet>
      ) : null}

      {/* Mobile / native drill-down sheet */}
      {showMobileChrome && selectedKey ? (
        <BottomSheet visible onClose={closeSelection} height="70%">
          <GeographyDrillDown
            geographyIdOrIso={selectedKey}
            vertical={filters.industryVertical}
            onClose={closeSelection}
            variant="sheet"
            style={styles.mobileDrill}
          />
        </BottomSheet>
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
  searchWrap: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 5,
  },
  searchWrapMobile: {
    top: 12,
    paddingRight: 100,
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
  mobileFilterBtn: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    zIndex: 6,
    backgroundColor: '#1a3a6e',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mobileFilterBtnText: {
    color: '#c8dcff',
    fontSize: 13,
    fontWeight: '700',
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
  mobileTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  mobileTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#161622',
    alignItems: 'center',
  },
  mobileTabActive: {
    backgroundColor: '#1a3a6e',
  },
  mobileTabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  mobileTabTextActive: {
    color: '#c8dcff',
  },
  mobileSheetScroll: {
    flex: 1,
  },
  mobileSheetScrollContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  mobileFilters: {
    width: '100%',
    borderRightWidth: 0,
  },
  mobileMatches: {
    borderTopWidth: 0,
    minHeight: 280,
  },
  mobileDrill: {
    width: '100%',
    borderLeftWidth: 0,
    flex: 1,
  },
});
