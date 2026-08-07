import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  DEFAULT_FILTERS,
  filtersEqual,
  filtersToQueryRecord,
  parseFiltersFromParams,
  toApiFilters,
  type ExplorerFilterState,
} from '@/lib/explorerFilters';
import {
  filterGeographies,
  type GeographyListItem,
} from '@/services/geographies';

const DEBOUNCE_MS = 200;

export function useExplorerFilters() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [filters, setFilters] = useState<ExplorerFilterState>(DEFAULT_FILTERS);
  const [matched, setMatched] = useState<GeographyListItem[]>([]);
  const [matchedIsoCodes, setMatchedIsoCodes] = useState<Set<string> | null>(null);
  const [filtering, setFiltering] = useState(false);
  const hydrated = useRef(false);
  const skipNextUrlSync = useRef(true);

  const applyFilters = useCallback(async (next: ExplorerFilterState) => {
    setFiltering(true);
    try {
      const apiFilters = toApiFilters(next);
      const hasActive = Object.keys(apiFilters).length > 0;
      const result = await filterGeographies(apiFilters, {
        limit: 200,
        vertical: next.industryVertical,
      });
      setMatched(result.data);
      setMatchedIsoCodes(
        hasActive
          ? new Set(
              result.data
                .map((g) => g.isoCode)
                .filter((iso): iso is string => Boolean(iso))
            )
          : null
      );
    } catch (err) {
      console.error('[Filters] Filter API failed:', err);
      // keep previous matches on error
    } finally {
      setFiltering(false);
    }
  }, []);

  // Hydrate from URL once (read-only; does not write params)
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const fromUrl = parseFiltersFromParams(
      params as Record<string, string | string[] | undefined>
    );
    skipNextUrlSync.current = true;
    setFilters(fromUrl);
  }, [params]);

  // Sync filter state → URL query params (never during render)
  useEffect(() => {
    if (!hydrated.current) return;
    if (Platform.OS !== 'web') return;
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const query = filtersToQueryRecord(filters);
    router.setParams({
      vertical: query.vertical ?? undefined,
      minPopulation: query.minPopulation ?? undefined,
      maxCorpTaxRate: query.maxCorpTaxRate ?? undefined,
      minTalentDensity: query.minTalentDensity ?? undefined,
      maxCompetitorSaturation: query.maxCompetitorSaturation ?? undefined,
      minRegulatoryEase: query.minRegulatoryEase ?? undefined,
    });
  }, [filters, router]);

  // Debounced API filter apply when filters change
  useEffect(() => {
    if (!hydrated.current) return;
    const handle = setTimeout(() => {
      void applyFilters(filters);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [filters, applyFilters]);

  const updateFilters = useCallback((patch: Partial<ExplorerFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    updateFilters,
    resetFilters,
    matched,
    matchedIsoCodes,
    filtering,
    isDefault: filtersEqual(filters, DEFAULT_FILTERS),
  };
}
