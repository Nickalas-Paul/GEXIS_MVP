import {
  AGENT_CATEGORY_KEYS,
  AGENT_CATEGORY_LABELS,
  AGENT_SELECTABLE_VERTICALS,
  INDUSTRY_VERTICAL_LABELS,
  type AgentCategory,
  type IndustryVerticalKey,
} from '@gexis/gexis-core';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AgentCard from '@/components/marketplace/AgentCard';
import { useAuth } from '@/services/auth';
import {
  searchMarketplace,
  type MarketplaceResponse,
} from '@/services/marketplace';
import {
  addToShortlist,
  getShortlist,
  removeFromShortlist,
} from '@/services/shortlist';

const DESKTOP_BREAKPOINT = 768;
const DEFAULT_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

type SortKey = 'rating' | 'engagements' | 'response_time';

type FilterState = {
  category: AgentCategory | '';
  vertical: string;
  query: string;
  sort: SortKey;
  page: number;
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: 'Highest Rated' },
  { key: 'engagements', label: 'Most Engagements' },
  { key: 'response_time', label: 'Fastest Response' },
];

const INITIAL_FILTERS: FilterState = {
  category: '',
  vertical: '',
  query: '',
  sort: 'rating',
  page: 1,
};

function paramToString(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function MarketplaceScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < DESKTOP_BREAKPOINT;
  const { isAuthenticated } = useAuth();
  const routeParams = useLocalSearchParams<{
    geography?: string | string[];
    limit?: string | string[];
  }>();

  const geography = paramToString(routeParams.geography);
  const limitParam = Number(paramToString(routeParams.limit));
  const pageLimit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(50, Math.floor(limitParam))
      : DEFAULT_LIMIT;

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [result, setResult] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const [shortlistBusy, setShortlistBusy] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  // Debounce search draft → filters.query
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = searchDraft.trim();
      setFilters((prev) => {
        if (prev.query === next) return prev;
        return { ...prev, query: next, page: 1 };
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  // Fetch directory when filters change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchMarketplace({
          geography: geography || undefined,
          category: filters.category || undefined,
          vertical: filters.vertical || undefined,
          query: filters.query || undefined,
          sort: filters.sort,
          page: filters.page,
          limit: pageLimit,
        });
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load marketplace'
          );
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    filters.category,
    filters.vertical,
    filters.query,
    filters.sort,
    filters.page,
    geography,
    pageLimit,
  ]);

  // Load shortlist when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setShortlisted(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const items = await getShortlist();
        if (!cancelled) {
          setShortlisted(new Set(items.map((i) => i.agentId)));
        }
      } catch {
        // Non-fatal — hearts simply stay empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const facetCounts = result?.facets.categories ?? {};
  const allCount = useMemo(
    () =>
      AGENT_CATEGORY_KEYS.reduce((sum, key) => sum + (facetCounts[key] ?? 0), 0),
    [facetCounts]
  );

  const setCategory = (category: AgentCategory | '') => {
    setFilters((prev) => ({ ...prev, category, page: 1 }));
  };

  const setVertical = (vertical: string) => {
    setFilters((prev) => ({ ...prev, vertical, page: 1 }));
  };

  const setSort = (sort: SortKey) => {
    setFilters((prev) => ({ ...prev, sort, page: 1 }));
  };

  const setPage = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const clearSearch = () => {
    setSearchDraft('');
    setFilters((prev) =>
      prev.query ? { ...prev, query: '', page: 1 } : prev
    );
  };

  const toggleShortlist = async (agentId: string) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (shortlistBusy.has(agentId)) return;

    const was = shortlisted.has(agentId);
    setShortlisted((prev) => {
      const next = new Set(prev);
      if (was) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
    setShortlistBusy((prev) => new Set(prev).add(agentId));

    try {
      if (was) await removeFromShortlist(agentId);
      else await addToShortlist(agentId);
    } catch {
      setShortlisted((prev) => {
        const next = new Set(prev);
        if (was) next.add(agentId);
        else next.delete(agentId);
        return next;
      });
    } finally {
      setShortlistBusy((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  const agents = result?.agents ?? [];
  const pagination = result?.pagination;
  const showEmpty = !loading && !error && agents.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          isNarrow && styles.scrollNarrow,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Marketplace</Text>
            <Text style={styles.title}>Agent Marketplace</Text>
          </View>
          <Link href="/marketplace/onboard" asChild>
            <Pressable style={styles.becomeBtn}>
              <Text style={styles.becomeBtnText}>Become an Agent</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search agents, specialties, industries..."
            placeholderTextColor="#9a9a96"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchDraft.length > 0 ? (
            <Pressable
              onPress={clearSearch}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <CategoryTab
            label="All"
            count={allCount}
            active={filters.category === ''}
            onPress={() => setCategory('')}
          />
          {AGENT_CATEGORY_KEYS.map((key) => (
            <CategoryTab
              key={key}
              label={AGENT_CATEGORY_LABELS[key]}
              count={facetCounts[key] ?? 0}
              active={filters.category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ScrollView>

        <View style={[styles.filterRow, isNarrow && styles.filterRowNarrow]}>
          <Dropdown
            label="Industry"
            testIDPrefix="industry"
            valueLabel={
              filters.vertical
                ? INDUSTRY_VERTICAL_LABELS[
                    filters.vertical as IndustryVerticalKey
                  ] ?? filters.vertical
                : 'All Industries'
            }
            options={[
              { key: '', label: 'All Industries' },
              ...AGENT_SELECTABLE_VERTICALS.map((key) => ({
                key,
                label: INDUSTRY_VERTICAL_LABELS[key],
              })),
            ]}
            onSelect={setVertical}
          />
          <Dropdown
            label="Sort"
            testIDPrefix="sort"
            valueLabel={
              SORT_OPTIONS.find((o) => o.key === filters.sort)?.label ??
              'Highest Rated'
            }
            options={SORT_OPTIONS.map((o) => ({
              key: o.key,
              label: o.label,
            }))}
            onSelect={(key) => setSort(key as SortKey)}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1a1a1a" />
            <Text style={styles.muted}>Loading agents...</Text>
          </View>
        ) : null}

        {showEmpty ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No agents found</Text>
            <Text style={styles.emptyCopy}>
              No agents found. Try adjusting your filters or search terms.
            </Text>
          </View>
        ) : null}

        {!loading && agents.length > 0 ? (
          <View style={[styles.grid, isNarrow && styles.gridNarrow]}>
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                narrow={isNarrow}
                shortlisted={shortlisted.has(agent.id)}
                onToggleShortlist={() => void toggleShortlist(agent.id)}
              />
            ))}          </View>
        ) : null}

        {pagination && pagination.totalPages > 0 ? (
          <View style={styles.pagination}>
            <Pressable
              style={[
                styles.pageBtn,
                pagination.page <= 1 && styles.pageBtnDisabled,
              ]}
              disabled={pagination.page <= 1}
              onPress={() => setPage(pagination.page - 1)}
            >
              <Text style={styles.pageBtnText}>Previous</Text>
            </Pressable>
            <Text style={styles.pageLabel}>
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
            </Text>
            <Pressable
              style={[
                styles.pageBtn,
                pagination.page >= pagination.totalPages &&
                  styles.pageBtnDisabled,
              ]}
              disabled={pagination.page >= pagination.totalPages}
              onPress={() => setPage(pagination.page + 1)}
            >
              <Text style={styles.pageBtnText}>Next</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryTab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label} · {count}
      </Text>
    </Pressable>
  );
}

function Dropdown({
  label,
  testIDPrefix,
  valueLabel,
  options,
  onSelect,
}: {
  label: string;
  testIDPrefix: string;
  valueLabel: string;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current as unknown as HTMLElement | null;
      if (el && typeof el.contains === 'function' && !el.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <View ref={wrapRef} style={styles.dropdownWrap} collapsable={false}>
      <Text style={styles.dropdownLabel}>{label}</Text>
      <Pressable
        testID={`${testIDPrefix}-trigger`}
        style={styles.dropdownTrigger}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={styles.dropdownValue} numberOfLines={1}>
          {valueLabel}
        </Text>
        <Text style={styles.dropdownCaret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdownMenu} testID={`${testIDPrefix}-menu`}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            {options.map((opt) => (
              <Pressable
                key={opt.key || 'all'}
                testID={`${testIDPrefix}-option-${opt.key || 'all'}`}
                style={styles.dropdownItem}
                onPress={() => {
                  onSelect(opt.key);
                  setOpen(false);
                }}
              >
                <Text style={styles.dropdownItemText}>{opt.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  scrollNarrow: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  headerText: {
    gap: 4,
    flexShrink: 1,
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6b6b6b',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  becomeBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  becomeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
  },
  searchIcon: {
    fontSize: 16,
    color: '#6b6b6b',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearBtn: {
    fontSize: 14,
    color: '#6b6b6b',
    paddingHorizontal: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tab: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3a3a',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    zIndex: 20,
  },
  filterRowNarrow: {
    flexDirection: 'column',
  },
  dropdownWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 30,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b6b6b',
    marginBottom: 6,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  dropdownValue: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
  },
  dropdownCaret: {
    fontSize: 12,
    color: '#6b6b6b',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 8,
    maxHeight: 240,
    zIndex: 50,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      },
      default: {
        elevation: 4,
      },
    }),
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ecece8',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  muted: {
    color: '#6b6b6b',
  },
  error: {
    color: '#b42318',
    fontSize: 14,
  },
  emptyBox: {
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  emptyCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4a4a4a',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridNarrow: {
    flexDirection: 'column',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 8,
  },
  pageBtn: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pageLabel: {
    fontSize: 14,
    color: '#4a4a4a',
  },
});
