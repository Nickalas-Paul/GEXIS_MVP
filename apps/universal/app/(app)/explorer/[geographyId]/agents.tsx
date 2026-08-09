import {
  AGENT_CATEGORY_KEYS,
  AGENT_CATEGORY_LABELS,
  type AgentCategory,
} from '@gexis/gexis-core';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { fetchGeographyById } from '@/services/geographies';
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
const SEARCH_DEBOUNCE_MS = 300;

function paramToString(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function GeographyAgentsScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < DESKTOP_BREAKPOINT;
  const { isAuthenticated } = useAuth();
  const routeParams = useLocalSearchParams<{
    geographyId: string | string[];
  }>();
  const geographyParam = paramToString(routeParams.geographyId);

  const [geoName, setGeoName] = useState<string | null>(null);
  const [geoUuid, setGeoUuid] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [category, setCategory] = useState<AgentCategory | ''>('');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!geographyParam) {
      setGeoError('Missing geography');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const geo = await fetchGeographyById(geographyParam);
        if (!cancelled) {
          setGeoName(geo.name);
          setGeoUuid(geo.id);
          setGeoError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setGeoError(
            err instanceof Error ? err.message : 'Geography not found'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geographyParam]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = searchDraft.trim();
      setQuery((prev) => (prev === next ? prev : next));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  useEffect(() => {
    if (!geoUuid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchMarketplace({
          geography: geoUuid,
          category: category || undefined,
          query: query || undefined,
          sort: 'rating',
          page: 1,
          limit: 50,
        });
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load agents'
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
  }, [geoUuid, category, query]);

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
        // non-fatal
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

  const toggleShortlist = async (agentId: string) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const was = shortlisted.has(agentId);
    setShortlisted((prev) => {
      const next = new Set(prev);
      if (was) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
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
    }
  };

  const agents = result?.agents ?? [];
  const showEmpty = !loading && !error && agents.length === 0 && Boolean(geoUuid);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isNarrow && styles.scrollNarrow,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Explorer</Text>
            <Text style={styles.title}>
              {geoName ? `Agents in ${geoName}` : 'Agents'}
            </Text>
          </View>
          <Link href="/marketplace" asChild>
            <Pressable style={styles.viewAllBtn}>
              <Text style={styles.viewAllBtnText}>View all agents</Text>
            </Pressable>
          </Link>
        </View>

        {geographyParam ? (
          <Link href={`/explorer/${geographyParam}`} style={styles.link}>
            ← Back to geography
          </Link>
        ) : null}

        {geoError ? <Text style={styles.error}>{geoError}</Text> : null}

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
          />
          {searchDraft.length > 0 ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <Pressable
            onPress={() => setCategory('')}
            style={[styles.tab, category === '' && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, category === '' && styles.tabTextActive]}
            >
              All · {allCount}
            </Text>
          </Pressable>
          {AGENT_CATEGORY_KEYS.map((key) => (
            <Pressable
              key={key}
              onPress={() => setCategory(key)}
              style={[styles.tab, category === key && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabText,
                  category === key && styles.tabTextActive,
                ]}
              >
                {AGENT_CATEGORY_LABELS[key]} · {facetCounts[key] ?? 0}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading || !geoUuid ? (
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
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  viewAllBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  viewAllBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  link: {
    fontSize: 14,
    color: '#0b57d0',
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
});
