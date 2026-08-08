import {
  MVI_DIMENSION_DISPLAY,
  MVI_SCORING_VERSION_LABEL,
  MVI_SOURCE_CATALOG,
  formatDirection,
  formatNormalization,
  sourceDisplayName,
} from '@gexis/gexis-core';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function SourcePill({ sourceKey }: { sourceKey: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{sourceDisplayName(sourceKey)}</Text>
    </View>
  );
}

export default function MethodologyScreen() {
  const dimensionCount = MVI_DIMENSION_DISPLAY.length;

  return (
    <MarketingShell theme="dark">
      <View style={styles.header}>
        <Text style={styles.title}>MVI Methodology</Text>
        <Text style={styles.subtitle}>
          How we score markets — transparent, auditable, deterministic
        </Text>
        <Text style={styles.version}>
          Scoring engine v{MVI_SCORING_VERSION_LABEL} · {dimensionCount} dimensions
        </Text>
      </View>

      <Section title="Overview">
        <Body>
          The Market Viability Index (MVI) is a 0–100 score that summarizes how
          attractive a geography is for market entry. Higher scores mean stronger
          overall viability on the dimensions we track today.
        </Body>
        <Body>
          Core principle: same data + same filters = same scores, every time.
          Re-running the scoring engine against unchanged inputs is deterministic —
          freshness labels track underlying source years, not the platform clock.
        </Body>
        <Body>
          Each dimension is scored 0–100. Missing dimensions are stored as null
          (not zero). Zero means “measured and weak,” not “no data.”
        </Body>
      </Section>

      <Section title="Dimensions">
        <Body>
          {dimensionCount} dimensions contribute to the overall score today. Indicator
          weights redistribute when a country is missing some inputs — we never invent
          zeros.
        </Body>

        {MVI_DIMENSION_DISPLAY.map((dim) => {
          const uniqueSources = Array.from(
            new Set(dim.indicators.map((i) => i.source))
          );
          return (
            <View key={dim.key} style={styles.dimCard}>
              <Text style={styles.dimLabel}>{dim.label}</Text>
              <Text style={styles.dimDesc}>{dim.description}</Text>

              {dim.isComposite ? (
                <>
                  <Text style={styles.dimSubhead}>Composite</Text>
                  <Text style={styles.indicatorNotes}>
                    Derived from trend momentum across the other six dimensions —
                    not from a single raw indicator series. See Trajectory Dimension
                    below.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.dimSubhead}>Indicators</Text>
                  {dim.indicators.map((ind) => (
                    <View key={ind.code} style={styles.indicatorRow}>
                      <Text style={styles.indicatorName}>
                        {ind.name}
                        {ind.isProxy ? ' (proxy)' : ''}
                      </Text>
                      <Text style={styles.indicatorMeta}>
                        {sourceDisplayName(ind.source)} · weight {ind.weight} ·{' '}
                        {formatNormalization(ind.normalization)} ·{' '}
                        {formatDirection(ind.direction)}
                      </Text>
                      {ind.notes ? (
                        <Text style={styles.indicatorNotes}>{ind.notes}</Text>
                      ) : null}
                    </View>
                  ))}

                  <Text style={styles.dimSubhead}>Data sources</Text>
                  <View style={styles.pillRow}>
                    {uniqueSources.map((src) => (
                      <SourcePill key={`${dim.key}-${src}`} sourceKey={src} />
                    ))}
                  </View>
                </>
              )}
            </View>
          );
        })}
      </Section>

      <Section title="Scoring">
        <Text style={styles.subHeading}>Dimension scores (0–100)</Text>
        <Bullet>
          Take the most recent non-null value per country for each indicator.
        </Bullet>
        <Bullet>
          Normalize across countries with data: linear min–max, or log10 then
          min–max for values that span orders of magnitude (GDP, population).
        </Bullet>
        <Bullet>
          Invert lower-is-better indicators (corporate tax): 100 − normalized.
        </Bullet>
        <Bullet>
          Combine available indicators with configured weights; redistribute when
          some indicators are missing.
        </Bullet>

        <Text style={styles.subHeading}>Overall MVI</Text>
        <Bullet>
          Default vertical (“All Industries”) weights the seven dimensions equally
          (~1/7 each), including Trajectory.
        </Bullet>
        <Bullet>
          Keep only dimensions with a real score, redistribute weights, then take a
          weighted average.
        </Bullet>
        <Bullet>
          If fewer than three dimensions have scores, overall is null (insufficient
          data).
        </Bullet>

        <Text style={styles.subHeading}>Industry verticals</Text>
        <Body>
          Industry verticals (Technology & SaaS, Financial Services, Manufacturing,
          and others) reweight dimensions at query time. Dimension scores are stored
          once under equal-weight; the overall MVI is recomputed on the fly for the
          selected vertical — same underlying dimensions, different emphasis.
          Some verticals emphasize Trajectory (e.g. tech) or de-emphasize it
          (e.g. manufacturing).
        </Body>
      </Section>

      <Section title="Trajectory Dimension">
        <Body>
          Trajectory is the seventh MVI dimension. It is a composite score derived
          from the trend momentum of the other six base dimensions — not from a
          separate raw indicator feed.
        </Body>
        <Bullet>
          A country where multiple dimensions are improving scores high on
          Trajectory.
        </Bullet>
        <Bullet>
          A country where dimensions are declining or stagnant scores low.
        </Bullet>
        <Bullet>
          By default Trajectory is weighted equally with the other dimensions;
          industry verticals may raise or lower that weight.
        </Bullet>
        <Bullet>
          Trajectory quantifies observed momentum. It is not a prediction of future
          outcomes.
        </Bullet>
      </Section>

      <Section title="Trend Projections">
        <Body>
          Historical indicator time series drive dimension-level trend estimates and
          forward projections shown in the explorer.
        </Body>
        <Bullet>
          Linear regression on normalized dimension-level time series estimates
          annualized rate and direction (improving / stable / declining).
        </Bullet>
        <Bullet>
          Domain-aware adjustments apply where needed (e.g. log-scale treatment for
          GDP-like series) and projected scores are clamped to the 0–100 scale.
        </Bullet>
        <Bullet>
          Projection horizons are 2 years and 5 years from the latest observation.
        </Bullet>
        <Bullet>
          Confidence intervals widen with horizon length — longer horizons are more
          uncertain.
        </Bullet>
        <Bullet>
          Trend confidence levels: High (8+ data points), Medium (5–7), Low (3–4).
          Fewer than three points yields insufficient data.
        </Bullet>
        <Bullet>
          The explorer time-horizon toggle can display projected overall scores on
          the choropleth (current / 2yr / 5yr).
        </Bullet>
        <Body>
          Transparency: projections are mechanical extrapolations of observed trends,
          not forecasts that incorporate external analysis, expert judgment, or
          scenario planning.
        </Body>
        <Text style={styles.subHeading}>What projections do not account for</Text>
        <Bullet>Policy changes and regulatory shifts</Bullet>
        <Bullet>Economic shocks and recessions</Bullet>
        <Bullet>Geopolitical events and conflict</Bullet>
        <Bullet>One-off structural breaks not yet visible in the series</Bullet>
      </Section>

      <Section title="Confidence Levels">
        <Body>
          Every score carries a confidence flag that communicates coverage honestly.
        </Body>
        <View style={styles.confCard}>
          <Text style={styles.confLevel}>High</Text>
          <Text style={styles.confRule}>
            5–6 base dimensions scored and ≥60% of configured indicators present
            (Trajectory is composite and does not replace coverage rules).
          </Text>
        </View>
        <View style={styles.confCard}>
          <Text style={styles.confLevel}>Medium</Text>
          <Text style={styles.confRule}>
            3–4 dimensions scored, or 30–59% indicator coverage.
          </Text>
        </View>
        <View style={styles.confCard}>
          <Text style={styles.confLevel}>Low</Text>
          <Text style={styles.confRule}>
            1–2 dimensions scored, or &lt;30% indicator coverage.
          </Text>
        </View>
        <Body>
          Proxy cap: if any contributing dimension relies only on proxy data (today:
          Talent Density), confidence is capped at medium even when coverage would
          otherwise be high.
        </Body>
      </Section>

      <Section title="Data Sources & Freshness">
        <Body>
          data_freshness is the oldest calendar year among indicators that actually
          contributed to a country’s score (stored as January 1 of that year, UTC).
          Re-running ingestion or scoring updates calculated_at; freshness only moves
          when newer source years enter the inputs.
        </Body>

        {MVI_SOURCE_CATALOG.map((src) => (
          <View key={src.key} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <SourcePill sourceKey={src.key} />
              <Text style={styles.sourceCadence}>{src.refreshCadence}</Text>
            </View>
            <Text style={styles.sourceName}>{src.name}</Text>
            <Text style={styles.sourceRole}>{src.role}</Text>
            <Text style={styles.sourceCoverage}>Coverage: {src.coverageApprox}</Text>
          </View>
        ))}
      </Section>

      <Section title="What MVI Does Not Do">
        <Bullet>
          Not a recommendation engine — scores describe measured conditions, they do
          not tell you where to expand.
        </Bullet>
        <Bullet>Not financial, legal, or investment advice.</Bullet>
        <Bullet>
          Scores reflect available public data, not ground truth on the ground.
        </Bullet>
        <Bullet>
          Confidence levels communicate uncertainty honestly — nulls and gaps beat
          false precision.
        </Bullet>
        <Bullet>
          Trend projections are not forecasts of policy, shocks, or geopolitics.
        </Bullet>
      </Section>
    </MarketingShell>
  );
}

const mono = { fontFamily: 'monospace' as const };

const styles = StyleSheet.create({
  header: {
    gap: 10,
    marginBottom: 28,
  },
  title: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 42,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    lineHeight: 24,
  },
  version: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 4,
    ...mono,
  },
  section: {
    marginBottom: 32,
    gap: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c2a',
  },
  sectionBody: {
    gap: 12,
    paddingTop: 4,
  },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 24,
  },
  subHeading: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 8,
  },
  bulletMark: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    lineHeight: 24,
  },
  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 24,
  },
  dimCard: {
    backgroundColor: '#12121f',
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  dimLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  dimDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: 20,
  },
  dimSubhead: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 6,
    ...mono,
  },
  indicatorRow: {
    gap: 2,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a28',
  },
  indicatorName: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '600',
  },
  indicatorMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 18,
    ...mono,
  },
  indicatorNotes: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    backgroundColor: '#161622',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    ...mono,
  },
  confCard: {
    backgroundColor: '#12121f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1c1c2a',
    padding: 14,
    gap: 4,
  },
  confLevel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  confRule: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
  },
  sourceCard: {
    backgroundColor: '#12121f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1c1c2a',
    padding: 14,
    gap: 6,
  },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sourceCadence: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    ...mono,
  },
  sourceName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sourceRole: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
  },
  sourceCoverage: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    ...mono,
  },
});
