import {
  MVI_DIMENSION_DISPLAY,
  type DimensionKey,
} from '@gexis/gexis-core';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { mviScoreColor } from '@/lib/mviColors';
import type { DimensionTrend, TrendData } from '@/services/geographies';

import TrendSparkline from './TrendSparkline';

const BASE_DIMS = MVI_DIMENSION_DISPLAY.filter((d) => !d.isComposite);

function directionMeta(direction: DimensionTrend['direction']): {
  arrow: string;
  label: string;
  color: string;
} {
  if (direction === 'improving') {
    return { arrow: '↑', label: 'Improving', color: '#3ecf8e' };
  }
  if (direction === 'declining') {
    return { arrow: '↓', label: 'Declining', color: '#d96b6b' };
  }
  return { arrow: '→', label: 'Stable', color: '#8b8b9a' };
}

function confidenceDot(level: string): string {
  if (level === 'high') return '#3ecf8e';
  if (level === 'medium') return '#e0a03a';
  return '#d96b6b';
}

function fmtScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(Math.round(n));
}

function fmtRate(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0.0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}`;
}

function fmtInterval(lo: number | null, hi: number | null): string {
  if (lo == null || hi == null) return '—';
  return `${Math.round(lo)}-${Math.round(hi)}`;
}

function DimensionTrendCard({
  label,
  dimKey,
  trend,
}: {
  label: string;
  dimKey: DimensionKey;
  trend: DimensionTrend | null;
}) {
  const color = mviScoreColor(trend?.currentScore ?? null) ?? '#5b8def';

  if (!trend) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={styles.insufficient}>Insufficient historical data</Text>
      </View>
    );
  }

  const dir = directionMeta(trend.direction);
  const series = trend.historicalScores ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={[styles.dirText, { color: dir.color }]}>
          {dir.arrow} {dir.label} ({fmtRate(trend.annualizedRate)}/yr)
        </Text>
      </View>

      <View style={styles.cardBody}>
        <TrendSparkline data={series} color={color} />
        <View style={styles.projCol}>
          <Text style={styles.projLine}>
            Current: <Text style={styles.projVal}>{fmtScore(trend.currentScore)}</Text>
          </Text>
          <Text style={styles.projLine}>
            2yr:{' '}
            <Text style={styles.projVal}>
              {fmtScore(trend.projected2yr)} (
              {fmtInterval(trend.confidence.lower2yr, trend.confidence.upper2yr)})
            </Text>
          </Text>
          <Text style={styles.projLine}>
            5yr:{' '}
            <Text style={styles.projVal}>
              {fmtScore(trend.projected5yr)} (
              {fmtInterval(trend.confidence.lower5yr, trend.confidence.upper5yr)})
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View
          style={[styles.dot, { backgroundColor: confidenceDot(trend.trendConfidence) }]}
        />
        <Text style={styles.metaText}>
          {trend.trendConfidence.charAt(0).toUpperCase() + trend.trendConfidence.slice(1)}{' '}
          confidence · {trend.dataPoints} data points
          {trend.yearRange
            ? ` · ${trend.yearRange[0]}–${trend.yearRange[1]}`
            : ''}
        </Text>
      </View>
    </View>
  );
}

function TrajectorySummary({
  score,
  trends,
}: {
  score: number | null;
  trends: TrendData['trends'];
}) {
  const lines = useMemo(() => {
    return BASE_DIMS.map((dim) => {
      const t = trends[dim.key];
      if (!t) {
        return { key: dim.key, label: dim.label, text: '— no trend', color: '#666' };
      }
      const dir = directionMeta(t.direction);
      return {
        key: dim.key,
        label: dim.label,
        text: `${dir.arrow} ${fmtRate(t.annualizedRate)}/yr`,
        color: dir.color,
      };
    });
  }, [trends]);

  return (
    <View style={[styles.card, styles.trajCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Trajectory (composite)</Text>
        <Text style={styles.trajScore}>Score: {fmtScore(score)}</Text>
      </View>
      <Text style={styles.trajIntro}>
        Derived from trend momentum across all dimensions:
      </Text>
      <View style={styles.trajGrid}>
        {lines.map((line) => (
          <Text key={line.key} style={styles.trajLine}>
            <Text style={{ color: line.color }}>{line.text}</Text>
            <Text style={styles.trajDim}> {line.label}</Text>
          </Text>
        ))}
      </View>
    </View>
  );
}

type Props = {
  trendData: TrendData | null;
  trajectoryScore: number | null;
  loading?: boolean;
};

export default function TrendAnalysisSection({
  trendData,
  trajectoryScore,
  loading,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>Trend Analysis</Text>
      {loading ? (
        <Text style={styles.insufficient}>Loading trends…</Text>
      ) : !trendData ? (
        <Text style={styles.insufficient}>Trend data unavailable for this geography.</Text>
      ) : (
        <>
          {BASE_DIMS.map((dim) => (
            <DimensionTrendCard
              key={dim.key}
              label={dim.label}
              dimKey={dim.key}
              trend={trendData.trends[dim.key] ?? null}
            />
          ))}
          <TrajectorySummary
            score={trajectoryScore}
            trends={trendData.trends}
          />
        </>
      )}
    </View>
  );
}

const mono = Platform.select({
  web: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  default: 'monospace',
});

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
    gap: 12,
  },
  sectionHeader: {
    color: '#8b8b9a',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: mono,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#12121a',
    borderWidth: 1,
    borderColor: '#232332',
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  trajCard: {
    borderColor: '#2a3a55',
    backgroundColor: '#10141c',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitle: {
    color: '#f2f2f7',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  dirText: {
    fontSize: 12,
    fontFamily: mono,
  },
  cardBody: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  projCol: {
    gap: 3,
    minWidth: 140,
  },
  projLine: {
    color: '#8b8b9a',
    fontSize: 12,
  },
  projVal: {
    color: '#d8d8e2',
    fontFamily: mono,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  metaText: {
    color: '#6e6e7c',
    fontSize: 11,
    fontFamily: mono,
    flex: 1,
  },
  insufficient: {
    color: '#6e6e7c',
    fontSize: 13,
    fontStyle: 'italic',
  },
  trajScore: {
    color: '#f2f2f7',
    fontSize: 13,
    fontFamily: mono,
    fontWeight: '600',
  },
  trajIntro: {
    color: '#8b8b9a',
    fontSize: 12,
  },
  trajGrid: {
    gap: 4,
  },
  trajLine: {
    fontSize: 12,
    fontFamily: mono,
  },
  trajDim: {
    color: '#6e6e7c',
  },
});
