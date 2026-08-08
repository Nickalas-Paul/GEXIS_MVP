import { MVI_DIMENSION_DISPLAY } from '@gexis/gexis-core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  COMPARE_MAX,
  useCompareSelection,
} from '@/hooks/useCompareSelection';
import { mviScoreColor } from '@/lib/mviColors';
import {
  getGeographyDetail,
  getGeographyTrends,
  type DimensionTrend,
  type GeographyDetail,
  type QuickFacts,
} from '@/services/geographies';

type ColumnResult =
  | {
      iso: string;
      status: 'ok';
      data: GeographyDetail;
      trends: Record<string, DimensionTrend | null>;
    }
  | { iso: string; status: 'error'; error: string };

function trendArrow(direction: DimensionTrend['direction'] | undefined): string {
  if (direction === 'improving') return '↑';
  if (direction === 'declining') return '↓';
  if (direction === 'stable') return '→';
  return '';
}

function trendArrowColor(direction: DimensionTrend['direction'] | undefined): string {
  if (direction === 'improving') return '#3ecf8e';
  if (direction === 'declining') return '#d96b6b';
  return '#8b8b9a';
}

function parseCompareParam(raw: string | string[] | undefined): string[] {
  if (raw == null) return [];
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,+]/)) {
    const iso = part.trim().toUpperCase();
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

function confidenceColor(c: string | null | undefined): string {
  if (c === 'high') return '#3ecf8e';
  if (c === 'medium') return '#e0a03a';
  if (c === 'low') return '#d96b6b';
  return '#666';
}

function formatPopulation(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

function formatGdpPpp(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1).replace(/\.0$/, '')}T`;
  }
  if (Math.abs(n) >= 1) {
    return `$${n.toFixed(1).replace(/\.0$/, '')}B`;
  }
  return `$${(n * 1000).toFixed(0)}M`;
}

function formatCorpTax(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function leaderIndexes(scores: Array<number | null>): Set<number> {
  const leaders = new Set<number>();
  let best: number | null = null;
  scores.forEach((s) => {
    if (s == null) return;
    if (best == null || s > best) best = s;
  });
  if (best == null) return leaders;
  scores.forEach((s, i) => {
    if (s != null && s === best) leaders.add(i);
  });
  return leaders;
}

function ColumnWidth(count: number, isWide: boolean): number | `${number}%` {
  if (!isWide) return 200;
  if (count <= 0) return '100%';
  return `${Math.floor(100 / count)}%`;
}

export default function CompareMarketsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ compare?: string | string[] }>();
  const { clearCompare } = useCompareSelection();
  const isWide = width >= 768;

  const isos = useMemo(() => parseCompareParam(params.compare), [params.compare]);

  const [columns, setColumns] = useState<ColumnResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isos.length === 0) {
      setColumns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      isos.map(async (iso): Promise<ColumnResult> => {
        try {
          const [data, trendPayload] = await Promise.all([
            getGeographyDetail(iso),
            getGeographyTrends(iso).catch(() => null),
          ]);
          return {
            iso,
            status: 'ok',
            data,
            trends: trendPayload?.trends ?? {},
          };
        } catch (err) {
          return {
            iso,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to load',
          };
        }
      })
    ).then((results) => {
      if (!cancelled) {
        setColumns(results);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isos]);

  const colWidth = ColumnWidth(Math.max(columns.length, 1), isWide);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        horizontal={false}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.push('/explorer');
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Back to Explorer</Text>
        </Pressable>

        <Text style={styles.title}>Compare Markets</Text>
        <Text style={styles.subtitle}>
          {isos.length === 0
            ? 'No markets selected'
            : `${isos.length} market${isos.length === 1 ? '' : 's'}`}
        </Text>

        {isos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Select 2–3 markets to compare</Text>
            <Text style={styles.emptyBody}>
              Use the Compare button on any market's detail page, then open the
              comparison view.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push('/explorer')}
            >
              <Text style={styles.primaryBtnText}>Go to Explorer</Text>
            </Pressable>
          </View>
        ) : null}

        {isos.length === 1 && !loading ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Add one or two more markets from their detail pages for a fuller
              side-by-side comparison.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Loading comparison…</Text>
          </View>
        ) : null}

        {!loading && columns.length > 0 ? (
          <ScrollView
            horizontal={!isWide}
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.tableScroll}
          >
            <View style={[styles.table, !isWide && { minWidth: columns.length * 200 }]}>
              {/* Country headers */}
              <View style={styles.headerRow}>
                {columns.map((col) => (
                  <View
                    key={col.iso}
                    style={[styles.col, { width: isWide ? colWidth : 200 }]}
                  >
                    {col.status === 'error' ? (
                      <>
                        <Text style={styles.countryName}>{col.iso}</Text>
                        <Text style={styles.errorText}>{col.error}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.countryName}>{col.data.name}</Text>
                        <Text style={styles.region}>
                          {(col.data.region ?? '—').toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.mviScore,
                            {
                              color: mviScoreColor(col.data.mvi?.overall ?? null),
                            },
                          ]}
                        >
                          MVI:{' '}
                          {col.data.mvi?.overall != null
                            ? Math.round(col.data.mvi.overall)
                            : '—'}
                        </Text>
                        <View style={styles.confRow}>
                          <View
                            style={[
                              styles.confDot,
                              {
                                backgroundColor: confidenceColor(
                                  col.data.mvi?.confidence
                                ),
                              },
                            ]}
                          />
                          <Text style={styles.confText}>
                            {(col.data.mvi?.confidence ?? 'n/a').replace(/^\w/, (c) =>
                              c.toUpperCase()
                            )}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>

              {/* Dimension rows (7 including Trajectory) */}
              {MVI_DIMENSION_DISPLAY.map((dim) => {
                const scores = columns.map((col) =>
                  col.status === 'ok'
                    ? (col.data.mvi?.dimensions?.[dim.key] ?? null)
                    : null
                );
                const leaders = leaderIndexes(scores);
                return (
                  <View key={dim.key} style={styles.dimBlock}>
                    {dim.isComposite ? (
                      <Text style={styles.momentumHeader}>MOMENTUM</Text>
                    ) : null}
                    <Text style={styles.dimLabel}>{dim.label}</Text>
                    <View style={styles.dimRow}>
                      {columns.map((col, idx) => {
                        const score = scores[idx];
                        const color = mviScoreColor(score);
                        const pct =
                          score != null ? Math.max(0, Math.min(100, score)) : 0;
                        const isLeader = leaders.has(idx);
                        const direction =
                          !dim.isComposite && col.status === 'ok'
                            ? col.trends[dim.key]?.direction
                            : undefined;
                        const arrow = trendArrow(direction);
                        return (
                          <View
                            key={`${dim.key}-${col.iso}`}
                            style={[
                              styles.col,
                              styles.scoreCell,
                              { width: isWide ? colWidth : 200 },
                              isLeader && styles.leaderCell,
                            ]}
                          >
                            <View style={styles.scoreLine}>
                              <Text
                                style={[
                                  styles.scoreValue,
                                  {
                                    color: score != null ? color : '#666',
                                  },
                                  isLeader && styles.leaderScore,
                                ]}
                              >
                                {score != null ? Math.round(score) : '—'}
                              </Text>
                              {arrow ? (
                                <Text
                                  style={[
                                    styles.trendArrow,
                                    { color: trendArrowColor(direction) },
                                  ]}
                                >
                                  {arrow}
                                </Text>
                              ) : null}
                              {isLeader ? (
                                <Text style={styles.leaderMark}>★</Text>
                              ) : null}
                            </View>
                            <View style={styles.barTrack}>
                              {score != null ? (
                                <View
                                  style={[
                                    styles.barFill,
                                    {
                                      width: `${pct}%`,
                                      backgroundColor: color,
                                    },
                                  ]}
                                />
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* Quick Facts */}
              <Text style={styles.qfSectionTitle}>QUICK FACTS</Text>
              {(
                [
                  {
                    key: 'population',
                    label: 'Population',
                    format: (q: QuickFacts | null) =>
                      formatPopulation(q?.population),
                  },
                  {
                    key: 'gdpPpp',
                    label: 'GDP (PPP)',
                    format: (q: QuickFacts | null) => formatGdpPpp(q?.gdpPpp),
                  },
                  {
                    key: 'corpTaxRate',
                    label: 'Corp. Tax Rate',
                    format: (q: QuickFacts | null) =>
                      formatCorpTax(q?.corpTaxRate),
                  },
                  {
                    key: 'language',
                    label: 'Language',
                    format: (q: QuickFacts | null) => q?.language ?? '—',
                  },
                  {
                    key: 'currency',
                    label: 'Currency',
                    format: (q: QuickFacts | null) => q?.currency ?? '—',
                  },
                ] as const
              ).map((row) => (
                <View key={row.key} style={styles.dimBlock}>
                  <Text style={styles.dimLabel}>{row.label}</Text>
                  <View style={styles.dimRow}>
                    {columns.map((col) => {
                      const value =
                        col.status === 'ok'
                          ? row.format(col.data.quickFacts)
                          : '—';
                      return (
                        <View
                          key={`${row.key}-${col.iso}`}
                          style={[
                            styles.col,
                            styles.scoreCell,
                            { width: isWide ? colWidth : 200 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.qfValue,
                              value === '—' && styles.qfMuted,
                            ]}
                          >
                            {value}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {isos.length > 0 ? (
          <View style={styles.actions}>
            <Pressable
              style={styles.ghostBtn}
              onPress={() => {
                if (__DEV__) console.log('[compare] Export stub');
              }}
            >
              <Text style={styles.ghostBtnText}>Export comparison</Text>
            </Pressable>
            <Pressable
              style={styles.dangerBtn}
              onPress={() => {
                clearCompare();
                router.push('/explorer');
              }}
            >
              <Text style={styles.dangerBtnText}>Clear selection</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const mono = { fontFamily: 'monospace' as const };

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0b12',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    color: '#8eb4ff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: -8,
    ...mono,
  },
  emptyCard: {
    backgroundColor: '#12121f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1c1c2a',
    padding: 24,
    gap: 12,
    marginTop: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: 22,
  },
  hintCard: {
    backgroundColor: '#161622',
    borderRadius: 8,
    padding: 12,
  },
  hintText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 20,
  },
  center: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
  },
  tableScroll: {
    flexGrow: 1,
  },
  table: {
    width: '100%',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flexShrink: 0,
  },
  countryName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  region: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    ...mono,
  },
  mviScore: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
    ...mono,
  },
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  confDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  confText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    ...mono,
  },
  errorText: {
    color: '#ff8f8f',
    fontSize: 12,
    marginTop: 8,
  },
  dimBlock: {
    backgroundColor: '#0e0e16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1c1c2a',
    padding: 14,
    gap: 10,
  },
  dimLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
  momentumHeader: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 4,
    marginTop: 8,
  },
  dimRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreCell: {
    gap: 8,
  },
  leaderCell: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 6,
    margin: -6,
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '600',
    ...mono,
  },
  leaderScore: {
    fontWeight: '800',
  },
  leaderMark: {
    color: 'rgba(255,220,120,0.85)',
    fontSize: 12,
  },
  trendArrow: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 2,
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  barFill: {
    height: 5,
    borderRadius: 3,
  },
  qfSectionTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginTop: 8,
    ...mono,
  },
  qfValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    ...mono,
  },
  qfMuted: {
    color: 'rgba(255,255,255,0.35)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a3a6e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: '#c8dcff',
    fontWeight: '600',
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ghostBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  dangerBtn: {
    backgroundColor: 'rgba(217,48,37,0.15)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dangerBtnText: {
    color: '#ff8f8f',
    fontWeight: '600',
  },
});
