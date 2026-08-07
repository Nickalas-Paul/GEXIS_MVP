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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  const applyFilters = useCallback(async (next: ExplorerFilterState) => {
    setFiltering(true);
    try {
      const apiFilters = toApiFilters(next);
      const hasActive = Object.keys(apiFilters).length > 0;
      const result = await filterGeographies(apiFilters, { limit: 200 });
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
    } catch {
      // keep previous matches on error
    } finally {
      setFiltering(false);
    }
  }, []);

  // Hydrate from URL once on web
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const fromUrl = parseFiltersFromParams(
      params as Record<string, string | string[] | undefined>
    );
    setFilters(fromUrl);
    void applyFilters(fromUrl);
  }, [applyFilters, params]);

  const syncUrl = useCallback(
    (next: ExplorerFilterState) => {
      if (Platform.OS !== 'web') return;
      const query = filtersToQueryRecord(next);
      router.setParams({
        vertical: query.vertical ?? undefined,
        minPopulation: query.minPopulation ?? undefined,
        maxCorpTaxRate: query.maxCorpTaxRate ?? undefined,
        minTalentDensity: query.minTalentDensity ?? undefined,
        maxCompetitorSaturation: query.maxCompetitorSaturation ?? undefined,
        minRegulatoryEase: query.minRegulatoryEase ?? undefined,
      });
    },
    [router]
  );

  const scheduleApply = useCallback(
    (next: ExplorerFilterState) => {
      syncUrl(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void applyFilters(next);
      }, DEBOUNCE_MS);
    },
    [applyFilters, syncUrl]
  );

  const updateFilters = useCallback(
    (patch: Partial<ExplorerFilterState>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        scheduleApply(next);
        return next;
      });
    },
    [scheduleApply]
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    scheduleApply(DEFAULT_FILTERS);
  }, [scheduleApply]);

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
