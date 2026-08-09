import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MarketSignal } from '@gexis/gexis-core';

import {
  COMPARE_MAX,
  useCompareSelection,
} from '@/hooks/useCompareSelection';
import {
  directionLabel,
  formatProbabilityPct,
  shortDimensionLabels,
  signalAccent,
} from '@/lib/signalsUi';
import {
  fetchGeographyById,
  type GeographyListItem,
} from '@/services/geographies';
import { getGeographySignals } from '@/services/signals';

const DIMENSIONS: Array<{
  key: keyof NonNullable<NonNullable<GeographyListItem['mvi']>['dimensions']>;
  label: string;
  color: string;
}> = [
  { key: 'marketSizeAndGrowth', label: 'Market Size & Growth', color: '#5b8def' },
  { key: 'talentDensity', label: 'Talent Density', color: '#3ecf8e' },
  { key: 'taxEnvironment', label: 'Tax Environment', color: '#e0a03a' },
  { key: 'regulatoryEase', label: 'Regulatory Ease', color: '#9b7bde' },
  { key: 'infrastructure', label: 'Infrastructure', color: '#2eb8a6' },
  { key: 'competitorSaturation', label: 'Competitor Saturation', color: '#d96b6b' },
  { key: 'trajectory', label: 'Trajectory', color: '#6b9bd1' },
];

function confidenceColor(c: string | null | undefined): string {
  if (c === 'high') return '#3ecf8e';
  if (c === 'medium') return '#e0a03a';
  if (c === 'low') return '#d96b6b';
  return '#666';
}

type Props = {
  geographyIdOrIso: string | null;
  vertical?: string;
  onClose: () => void;
  variant?: 'panel' | 'sheet';
  style?: object;
};

export default function GeographyDrillDown({
  geographyIdOrIso,
  vertical = 'all',
  onClose,
  variant = 'panel',
  style,
}: Props) {
  const router = useRouter();
  const { addToCompare, removeFromCompare, isSelected, isAtMax, selected } =
    useCompareSelection();
  const [data, setData] = useState<GeographyListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<MarketSignal[]>([]);

  useEffect(() => {
    if (!geographyIdOrIso) {
      setData(null);
      setSignals([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignals([]);
    void fetchGeographyById(geographyIdOrIso, vertical)
      .then((geo) => {
        if (!cancelled) setData(geo);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Additive: never block dimension scores on signals.
    void getGeographySignals(geographyIdOrIso).then((res) => {
      if (!cancelled) setSignals(res.signals);
    });
    return () => {
      cancelled = true;
    };
  }, [geographyIdOrIso, vertical]);

  if (!geographyIdOrIso) return null;

  const overall = data?.mvi?.overall ?? null;
  const dims = data?.mvi?.dimensions;
  const region = (data?.region ?? '').toUpperCase();
  const geoKey = data?.isoCode ?? data?.id ?? geographyIdOrIso;

  return (
    <View
      style={StyleSheet.flatten([
        variant === 'panel' ? styles.panel : styles.sheet,
        style,
      ])}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          {region ? <Text style={styles.region}>{region}</Text> : null}
          <Text style={styles.name}>{data?.name ?? '…'}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && data ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreBig}>
              {overall != null ? Math.round(overall) : '—'}
            </Text>
            <View>
              <Text style={styles.scoreUnit}>/100 MVI</Text>
              <View style={styles.confRow}>
                <View
                  style={StyleSheet.flatten([
                    styles.confDot,
                    { backgroundColor: confidenceColor(data.mvi?.confidence) },
                  ])}
                />
                <Text style={styles.confLabel}>
                  {(data.mvi?.confidence ?? 'unknown').toUpperCase()} CONFIDENCE
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.dims}>
            {DIMENSIONS.map((dim) => {
              const value = dims?.[dim.key] ?? null;
              const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
              return (
                <View key={dim.key} style={styles.dimRow}>
                  <View style={styles.dimHeader}>
                    <Text style={styles.dimLabel}>{dim.label}</Text>
                    <Text
                      style={StyleSheet.flatten([
                        styles.dimValue,
                        { color: dim.color },
                      ])}
                    >
                      {value != null ? Math.round(value) : '—'}
                    </Text>
                  </View>
                  <View style={styles.dimTrack}>
                    <View
                      style={StyleSheet.flatten([
                        styles.dimFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: dim.color,
                          opacity: value == null ? 0.25 : 1,
                        },
                      ])}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {signals.length > 0 ? (
            <View style={styles.signalsSection}>
              <View style={styles.signalsHeader}>
                <Text style={styles.signalsTitle}>ACTIVE SIGNALS</Text>
                <View style={styles.signalsBadge}>
                  <Text style={styles.signalsBadgeText}>{signals.length}</Text>
                </View>
              </View>
              {signals.map((sig) => {
                const accent = signalAccent(sig.direction);
                const prob = formatProbabilityPct(sig.probability);
                const dims = shortDimensionLabels(sig.affectedDimensions);
                return (
                  <View
                    key={sig.id}
                    style={StyleSheet.flatten([
                      styles.signalCard,
                      { backgroundColor: accent.cardBg },
                    ])}
                  >
                    <View
                      style={StyleSheet.flatten([
                        styles.signalDot,
                        { backgroundColor: accent.dot },
                      ])}
                    />
                    <View style={styles.signalBody}>
                      <Text style={styles.signalTitle} numberOfLines={2}>
                        {sig.title}
                      </Text>
                      <View style={styles.signalTags}>
                        {prob ? (
                          <View
                            style={StyleSheet.flatten([
                              styles.signalPill,
                              { backgroundColor: accent.pillBg },
                            ])}
                          >
                            <Text
                              style={StyleSheet.flatten([
                                styles.signalPillText,
                                { color: accent.pillText },
                              ])}
                            >
                              {prob}
                            </Text>
                          </View>
                        ) : (
                          <View
                            style={StyleSheet.flatten([
                              styles.signalPill,
                              { backgroundColor: accent.pillBg },
                            ])}
                          >
                            <Text
                              style={StyleSheet.flatten([
                                styles.signalPillText,
                                { color: accent.pillText },
                              ])}
                            >
                              {directionLabel(sig.direction)}
                            </Text>
                          </View>
                        )}
                        {dims ? (
                          <Text style={styles.signalDims} numberOfLines={1}>
                            {dims}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.actions}>
            {/* router.push avoids Link asChild → Slot style-array crash on native */}
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                const base = `/explorer/${encodeURIComponent(geoKey)}`;
                const href =
                  vertical && vertical !== 'all'
                    ? `${base}?vertical=${encodeURIComponent(vertical)}`
                    : base;
                router.push(href as `/explorer/${string}`);
              }}
            >
              <Text style={styles.actionText}>Full breakdown →</Text>
            </Pressable>
            <Pressable
              style={StyleSheet.flatten([
                styles.actionBtn,
                styles.actionBtnSecondary,
                isSelected(geoKey) && styles.actionBtnCompareActive,
                isAtMax && !isSelected(geoKey) && styles.actionBtnDisabled,
              ])}
              disabled={isAtMax && !isSelected(geoKey)}
              onPress={() => {
                if (isSelected(geoKey)) removeFromCompare(geoKey);
                else addToCompare(geoKey);
              }}
            >
              <Text
                style={
                  isSelected(geoKey)
                    ? styles.actionText
                    : styles.actionTextSecondary
                }
              >
                {isSelected(geoKey)
                  ? `In compare (${selected.length}/${COMPARE_MAX})`
                  : isAtMax
                    ? `Compare full (${COMPARE_MAX}/${COMPARE_MAX})`
                    : 'Add to compare'}
              </Text>
            </Pressable>
            <Pressable
              style={StyleSheet.flatten([
                styles.actionBtn,
                styles.actionBtnSecondary,
              ])}
              onPress={() =>
                router.push(
                  `/explorer/${encodeURIComponent(geoKey)}/agents` as `/explorer/${string}/agents`
                )
              }
            >
              <Text style={styles.actionTextSecondary}>View agents →</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 320,
    backgroundColor: '#0e0e16',
    borderLeftWidth: 1,
    borderLeftColor: '#1c1c2a',
    paddingTop: 16,
  },
  sheet: {
    backgroundColor: '#0e0e16',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#1c1c2a',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  region: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  center: {
    padding: 24,
    alignItems: 'center',
  },
  error: {
    color: '#ff8f8f',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 20,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreBig: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 52,
  },
  scoreUnit: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dims: {
    gap: 14,
  },
  dimRow: {
    gap: 6,
  },
  dimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dimLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  dimValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  dimTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#232336',
    overflow: 'hidden',
  },
  dimFill: {
    height: 4,
    borderRadius: 2,
  },
  signalsSection: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1c1c2a',
  },
  signalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalsTitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  signalsBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalsBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
  },
  signalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  signalDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 4,
  },
  signalBody: {
    flex: 1,
    gap: 6,
  },
  signalTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 16,
  },
  signalTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  signalPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  signalPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  signalDims: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    flexShrink: 1,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    backgroundColor: '#1a3a6e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  actionBtnCompareActive: {
    backgroundColor: '#2a4a3e',
    borderColor: '#2a4a3e',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: '#c8dcff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionTextSecondary: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
