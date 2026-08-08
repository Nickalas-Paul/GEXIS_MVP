import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

export const COMPARE_MAX = 3;

function normalizeIso(isoCode: string): string {
  return isoCode.trim().toUpperCase();
}

function parseCompareParam(
  raw: string | string[] | undefined
): string[] {
  if (raw == null) return [];
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,+]/)) {
    const iso = normalizeIso(part);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

export function compareHref(isos: string[]): string {
  if (isos.length === 0) return '/explorer/compare';
  return `/explorer/compare?compare=${encodeURIComponent(isos.join(','))}`;
}

type CompareContextValue = {
  selected: string[];
  addToCompare: (isoCode: string) => boolean;
  removeFromCompare: (isoCode: string) => void;
  clearCompare: () => void;
  isSelected: (isoCode: string) => boolean;
  isAtMax: boolean;
  compareHref: string;
};

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ compare?: string | string[] }>();
  const [selected, setSelected] = useState<string[]>([]);
  const hydrated = useRef(false);
  const skipUrlSync = useRef(true);

  // Hydrate from URL once (web shareable links / deep links)
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const fromUrl = parseCompareParam(params.compare);
    if (fromUrl.length > 0) {
      skipUrlSync.current = true;
      setSelected(fromUrl);
    }
  }, [params.compare]);

  // Keep selection in sync when URL compare param changes externally
  useEffect(() => {
    if (!hydrated.current) return;
    const fromUrl = parseCompareParam(params.compare);
    setSelected((prev) => {
      if (fromUrl.join(',') === prev.join(',')) return prev;
      // Only adopt URL when it carries a compare list (avoid wiping on routes without param)
      if (fromUrl.length === 0 && !params.compare) return prev;
      skipUrlSync.current = true;
      return fromUrl;
    });
  }, [params.compare]);

  // Persist to URL query params on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!hydrated.current) return;
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    const next = selected.length > 0 ? selected.join(',') : undefined;
    const current = Array.isArray(params.compare)
      ? params.compare.join(',')
      : params.compare;
    if ((current ?? undefined) === next) return;
    try {
      router.setParams({ compare: next });
    } catch {
      // Some routes may not accept arbitrary params; compare page always does.
    }
  }, [selected, router, params.compare]);

  const addToCompare = useCallback((isoCode: string): boolean => {
    const iso = normalizeIso(isoCode);
    if (!iso) return false;
    let added = false;
    setSelected((prev) => {
      if (prev.includes(iso) || prev.length >= COMPARE_MAX) return prev;
      added = true;
      return [...prev, iso];
    });
    // Note: setState updater runs sync in React 18 for this event path
    return added;
  }, []);

  const removeFromCompare = useCallback((isoCode: string) => {
    const iso = normalizeIso(isoCode);
    setSelected((prev) => prev.filter((c) => c !== iso));
  }, []);

  const clearCompare = useCallback(() => {
    setSelected([]);
  }, []);

  const isSelected = useCallback(
    (isoCode: string) => selected.includes(normalizeIso(isoCode)),
    [selected]
  );

  const value = useMemo<CompareContextValue>(
    () => ({
      selected,
      addToCompare,
      removeFromCompare,
      clearCompare,
      isSelected,
      isAtMax: selected.length >= COMPARE_MAX,
      compareHref: compareHref(selected),
    }),
    [
      selected,
      addToCompare,
      removeFromCompare,
      clearCompare,
      isSelected,
    ]
  );

  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  );
}

export function useCompareSelection(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error('useCompareSelection must be used within CompareProvider');
  }
  return ctx;
}
