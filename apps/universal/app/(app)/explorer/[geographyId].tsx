import {
  MVI_DIMENSION_DISPLAY,
  sourceDisplayName,
  type DimensionKey,
} from '@gexis/gexis-core';
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

import { mviScoreColor } from '@/lib/mviColors';
import {
  getGeographyDetail,
  type GeographyDetail,
  type MviSourceRef,
  type QuickFacts,
} from '@/services/geographies';

function confidenceColor(c: string | null | undefined): string {
  if (c === 'high') return '#3ecf8e';
  if (c === 'medium') return '#e0a03a';
  if (c === 'low') return '#d96b6b';
  return '#666';
}

function formatRefreshDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format large counts: 83200000 → "83.2M", 1400000000 → "1.4B". */
function formatPopulation(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

/**
 * Format GDP PPP. IMF WEO values are stored in billions USD.
 * e.g. 5996.2 → "$6.0T", 924.6 → "$924.6B"
 */
function formatGdpPpp(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const billions = n;
  if (Math.abs(billions) >= 1000) {
    return `$${(billions / 1000).toFixed(1).replace(/\.0$/, '')}T`;
  }
  if (Math.abs(billions) >= 1) {
    return `$${billions.toFixed(1).replace(/\.0$/, '')}B`;
  }
  return `$${(billions * 1000).toFixed(0)}M`;
}

function formatCorpTax(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function QuickFactsPanel({
  facts,
  overall,
  compact,
}: {
  facts: QuickFacts | null;
  overall: number | null;
  compact?: boolean;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Population', value: formatPopulation(facts?.population) },
    { label: 'GDP (PPP)', value: formatGdpPpp(facts?.gdpPpp) },
    { label: 'Corp. Tax Rate', value: formatCorpTax(facts?.corpTaxRate) },
    {
      label: 'Ease of Business',
      value: facts?.easeOfBusiness ?? '—',
    },
    { label: 'Language', value: facts?.language ?? '—' },
    { label: 'Currency', value: facts?.currency ?? '—' },
  ];

  return (
    <View style={[styles.qfPanel, compact ? styles.qfPanelCompact : null]}>
      {/* TODO: Mini-map (Mapbox dark-v11, country polygon filled with MVI color).
          Deferred — Quick Facts data display is the priority for this step. */}
      <View
        style={[
          styles.miniMapPlaceholder,
          { borderColor: mviScoreColor(overall) },
        ]}
      >
        <View
          style={[styles.miniMapSwatch, { backgroundColor: mviScoreColor(overall) }]}
        />
        <Text style={styles.miniMapLabel}>MAP PREVIEW</Text>
      </View>

      <Text style={styles.qfHeader}>QUICK FACTS</Text>
      <View style={[styles.qfRows, compact ? styles.qfRowsCompact : null]}>
        {rows.map((row) => (
          <View
            key={row.label}
            style={[styles.qfRow, compact ? styles.qfRowCompact : null]}
          >
            <Text style={styles.qfLabel}>{row.label}</Text>
            <Text
              style={[
                styles.qfValue,
                row.value === '—' ? styles.qfValueMuted : null,
              ]}
            >
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function sourcesForDimension(
  key: DimensionKey,
  allSources: MviSourceRef[]
): MviSourceRef[] {
  const meta = MVI_DIMENSION_DISPLAY.find((d) => d.key === key);
  if (!meta) return [];
  const codes = new Set(meta.indicatorCodes);
  return allSources.filter((s) => codes.has(s.indicator));
}

function uniqueSourceLabels(sources: MviSourceRef[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of sources) {
    if (seen.has(s.source)) continue;
    seen.add(s.source);
    labels.push(sourceDisplayName(s.source));
  }
  return labels;
}

function DimensionCard({
  dimKey,
  label,
  description,
  score,
  confidence,
  sources,
}: {
  dimKey: string;
  label: string;
  description: string;
  score: number | null;
  confidence: string | null;
  sources: MviSourceRef[];
}) {
  const [expanded, setExpanded] = useState(false);
  const color = mviScoreColor(score);
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  const sourceLabels = uniqueSourceLabels(sources);

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={styles.dimCard}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.dimTop}>
        <View style={styles.dimTextCol}>
          <Text style={styles.dimName}>{label}</Text>
          <Text style={styles.dimDesc}>{description}</Text>
        </View>
        <View style={styles.dimScoreCol}>
          <Text style={[styles.dimScore, { color: score != null ? color : '#666' }]}>
            {score != null ? Math.round(score) : '—'}
          </Text>
          <View style={styles.confRow}>
            <View
              style={[styles.confDot, { backgroundColor: confidenceColor(confidence) }]}
            />
            <Text style={styles.confText}>
              {(confidence ?? 'n/a').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.barTrack}>
        {score != null ? (
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        ) : null}
      </View>

      {sourceLabels.length > 0 ? (
        <View style={styles.tagRow}>
          {sourceLabels.map((tag) => (
            <View key={`${dimKey}-${tag}`} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noData}>No source data</Text>
      )}

      {expanded ? (
        <View style={styles.expandBlock}>
          {sources.length === 0 ? (
            <Text style={styles.expandEmpty}>No underlying indicators available.</Text>
          ) : (
            sources.map((s) => (
              <Text
                key={`${s.source}-${s.indicator}-${s.year}`}
                style={styles.expandLine}
              >
                {sourceDisplayName(s.source)} · {s.indicator} · {s.year}
              </Text>
            ))
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function GeographyDetailScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    geographyId: string;
    vertical?: string;
  }>();
  const geographyId = String(params.geographyId ?? '').trim();
  const vertical = String(params.vertical ?? 'all').trim() || 'all';

  const [data, setData] = useState<GeographyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!geographyId) {
      setError('Geography not found');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getGeographyDetail(geographyId, vertical)
      .then((geo) => {
        if (!cancelled) setData(geo);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Failed to load geography');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geographyId, vertical]);

  const overall = data?.mvi?.overall ?? null;
  const overallColor = mviScoreColor(overall);
  const allSources = data?.mvi?.sources ?? [];
  const sourceCount = useMemo(() => {
    const set = new Set(allSources.map((s) => s.source));
    return set.size;
  }, [allSources]);

  const isWide = width >= 768;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isWide ? styles.scrollContentWide : null,
        ]}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push('/explorer');
            }
          }}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Text style={styles.backText}>← Explorer</Text>
        </Pressable>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Loading geography…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Geography not found</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Pressable style={styles.errorBack} onPress={() => {
              if (router.canGoBack()) router.back();
              else router.push('/explorer');
            }}>
              <Text style={styles.backText}>← Back to explorer</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && data ? (
          <View style={[styles.mainRow, isWide ? styles.mainRowWide : null]}>
            <View style={[styles.mainCol, isWide ? styles.mainColWide : null]}>
              <Text style={styles.region}>
                {(data.region ?? 'Unknown region').toUpperCase()}
              </Text>
              <Text style={styles.country}>{data.name}</Text>

              <View style={styles.overallBlock}>
                <Text style={[styles.overallScore, { color: overallColor }]}>
                  {overall != null ? Math.round(overall) : '—'}
                </Text>
                <Text style={styles.overallLabel}>Market Viability Index</Text>
              </View>

              <View style={styles.pillsRow}>
                <View style={styles.pill}>
                  <View
                    style={[
                      styles.confDot,
                      { backgroundColor: confidenceColor(data.mvi?.confidence) },
                    ]}
                  />
                  <Text style={styles.pillText}>
                    {(data.mvi?.confidence ?? 'n/a').replace(/^\w/, (c) =>
                      c.toUpperCase()
                    )}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    Last refresh: {formatRefreshDate(data.mvi?.dataFreshness ?? data.mvi?.calculatedAt)}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    Sources: {sourceCount} active
                  </Text>
                </View>
              </View>

              {!isWide ? (
                <QuickFactsPanel
                  facts={data.quickFacts}
                  overall={overall}
                  compact
                />
              ) : null}

              <View style={styles.dimStack}>
                {MVI_DIMENSION_DISPLAY.map((dim) => {
                  const score = data.mvi?.dimensions?.[dim.key] ?? null;
                  const dimSources = sourcesForDimension(dim.key, allSources);
                  return (
                    <DimensionCard
                      key={dim.key}
                      dimKey={dim.key}
                      label={dim.label}
                      description={dim.description}
                      score={score}
                      confidence={data.mvi?.confidence ?? null}
                      sources={dimSources}
                    />
                  );
                })}
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => {
                    // Wired in Step 4
                    if (__DEV__) console.log('[detail] Compare placeholder', data.isoCode);
                  }}
                >
                  <Text style={styles.actionText}>⇄ Compare</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                  onPress={() => {
                    // Wired in Step 9
                    if (__DEV__) console.log('[detail] Export placeholder', data.isoCode);
                  }}
                >
                  <Text style={styles.actionTextGhost}>Export</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                  onPress={() =>
                    router.push(
                      `/explorer/${encodeURIComponent(data.isoCode ?? data.id)}/agents`
                    )
                  }
                >
                  <Text style={styles.actionTextGhost}>View agents →</Text>
                </Pressable>
              </View>
            </View>

            {isWide ? (
              <View style={styles.sideCol}>
                <QuickFactsPanel facts={data.quickFacts} overall={overall} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const mono = {
  fontFamily: 'monospace' as const,
};

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
  },
  scrollContentWide: {
    paddingHorizontal: 32,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 4,
  },
  backText: {
    color: '#8eb4ff',
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    paddingVertical: 64,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  errorBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBack: {
    marginTop: 12,
  },
  mainRow: {
    flexDirection: 'column',
    gap: 24,
  },
  mainRowWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainCol: {
    flex: 1,
    gap: 16,
  },
  mainColWide: {
    flex: 1,
    maxWidth: 720,
  },
  sideCol: {
    width: 300,
    flexShrink: 0,
  },
  qfPanel: {
    backgroundColor: '#0e0e16',
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  qfPanelCompact: {
    marginTop: 4,
  },
  miniMapPlaceholder: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#12121c',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  miniMapSwatch: {
    width: 56,
    height: 36,
    borderRadius: 6,
    opacity: 0.85,
  },
  miniMapLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
  },
  qfHeader: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    fontFamily: 'monospace',
  },
  qfRows: {
    gap: 10,
  },
  qfRowsCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  qfRowCompact: {
    width: '48%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#12121c',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  qfLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  qfValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  qfValueMuted: {
    color: 'rgba(255,255,255,0.35)',
  },
  region: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    ...mono,
  },
  country: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
  },
  overallBlock: {
    gap: 4,
    marginTop: 4,
  },
  overallScore: {
    fontSize: 64,
    fontWeight: '700',
    lineHeight: 68,
    ...mono,
  },
  overallLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    ...mono,
  },
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  confDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  confText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    ...mono,
  },
  dimStack: {
    gap: 12,
    marginTop: 8,
  },
  dimCard: {
    backgroundColor: '#0e0e16',
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  dimTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dimTextCol: {
    flex: 1,
    gap: 4,
  },
  dimName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  dimDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 17,
  },
  dimScoreCol: {
    alignItems: 'flex-end',
  },
  dimScore: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
    ...mono,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#161622',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    ...mono,
  },
  noData: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    ...mono,
  },
  expandBlock: {
    borderTopWidth: 1,
    borderTopColor: '#1c1c2a',
    paddingTop: 10,
    gap: 4,
  },
  expandLine: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    lineHeight: 16,
    ...mono,
  },
  expandEmpty: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    backgroundColor: '#1a3a6e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  actionText: {
    color: '#c8dcff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionTextGhost: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});
