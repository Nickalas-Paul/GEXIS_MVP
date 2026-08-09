import { useCallback, useEffect, useState } from 'react';

import {
  savedFiltersToState,
  type ExplorerFilterState,
} from '@/lib/explorerFilters';
import {
  createSavedSearch,
  deleteSavedSearch as apiDeleteSavedSearch,
  listSavedSearches,
  type SavedSearch,
} from '@/services/savedSearches';

export type UseSavedSearchesResult = {
  savedSearches: SavedSearch[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveCurrentFilters: (
    name: string,
    currentFilters: Record<string, unknown>
  ) => Promise<SavedSearch>;
  applySavedSearch: (search: SavedSearch) => ExplorerFilterState;
  deleteSavedSearch: (id: string) => Promise<void>;
};

export function useSavedSearches(options?: {
  enabled?: boolean;
}): UseSavedSearchesResult {
  const enabled = options?.enabled ?? true;
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSavedSearches([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listSavedSearches();
      setSavedSearches(list);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load saved searches';
      setError(message);
      setSavedSearches([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCurrentFilters = useCallback(
    async (name: string, currentFilters: Record<string, unknown>) => {
      const created = await createSavedSearch(name, currentFilters);
      await refresh();
      return created;
    },
    [refresh]
  );

  const applySavedSearch = useCallback((search: SavedSearch): ExplorerFilterState => {
    return savedFiltersToState(search.filters);
  }, []);

  const deleteSavedSearch = useCallback(
    async (id: string) => {
      await apiDeleteSavedSearch(id);
      await refresh();
    },
    [refresh]
  );

  return {
    savedSearches,
    loading,
    error,
    refresh,
    saveCurrentFilters,
    applySavedSearch,
    deleteSavedSearch,
  };
}