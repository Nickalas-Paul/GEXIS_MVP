import { useId, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  FILTER_LIMITS,
  formatMaxScore,
  formatMinScore,
  formatPercentCap,
  formatPopulation,
  type ExplorerFilterState,
  type TimeHorizon,
} from '@/lib/explorerFilters';

import IndustryVerticalSelect from './IndustryVerticalSelect';

type Props = {
  filters: ExplorerFilterState;
  onChange: (patch: Partial<ExplorerFilterState>) => void;
  onReset: () => void;
  style?: object;
};

const HORIZON_OPTIONS: Array<{ value: TimeHorizon; label: string }> = [
  { value: 'current', label: 'Current' },
  { value: '2yr', label: '2-Year' },
  { value: '5yr', label: '5-Year' },
];

function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  accent = '#3d8bfd',
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent?: string;
}) {
  const id = useId();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.sliderTrackWrap}>
        <View style={styles.sliderTrackBg}>
          <View
            style={StyleSheet.flatten([
              styles.sliderTrackFill,
              { width: `${pct}%`, backgroundColor: accent },
            ])}
          />
        </View>
        {/* RN Web: native range for smooth drag */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            opacity: 0.01,
            height: 28,
            cursor: 'pointer',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.nativeSliderFallback}>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <View style={StyleSheet.flatten([styles.sliderTrackBg, { flex: 1 }])}>
        <View
          style={StyleSheet.flatten([
            styles.sliderTrackFill,
            { width: `${pct}%`, backgroundColor: accent },
          ])}
        />
      </View>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function FilterRow({
  label,
  valueLabel,
  children,
}: {
  label: string;
  valueLabel: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{valueLabel}</Text>
      </View>
      {children}
    </View>
  );
}

export default function FilterSidebar({ filters, onChange, onReset, style }: Props) {
  return (
    <View style={StyleSheet.flatten([styles.sidebar, style])}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FILTERS</Text>
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>

      <View style={StyleSheet.flatten([styles.row, styles.verticalRow])}>
        <Text style={styles.rowLabel}>Industry Vertical</Text>
        <IndustryVerticalSelect
          value={filters.industryVertical}
          onChange={(industryVertical) => onChange({ industryVertical })}
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Time Horizon</Text>
        <View style={styles.segmentRow}>
          {HORIZON_OPTIONS.map((opt) => {
            const active = filters.horizon === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange({ horizon: opt.value })}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FilterRow
        label="Population"
        valueLabel={formatPopulation(filters.minPopulation)}
      >
        <RangeSlider
          value={filters.minPopulation}
          min={FILTER_LIMITS.minPopulation.min}
          max={FILTER_LIMITS.minPopulation.max}
          step={FILTER_LIMITS.minPopulation.step}
          accent="#5b8def"
          onChange={(minPopulation) => onChange({ minPopulation })}
        />
      </FilterRow>

      <FilterRow
        label="Corp. Tax Rate Cap"
        valueLabel={formatPercentCap(filters.maxCorpTaxRate)}
      >
        <RangeSlider
          value={filters.maxCorpTaxRate}
          min={FILTER_LIMITS.maxCorpTaxRate.min}
          max={FILTER_LIMITS.maxCorpTaxRate.max}
          step={FILTER_LIMITS.maxCorpTaxRate.step}
          accent="#e0a03a"
          onChange={(maxCorpTaxRate) => onChange({ maxCorpTaxRate })}
        />
      </FilterRow>

      <FilterRow
        label="Talent Density Min."
        valueLabel={formatMinScore(filters.minTalentDensity)}
      >
        <RangeSlider
          value={filters.minTalentDensity}
          min={FILTER_LIMITS.minTalentDensity.min}
          max={FILTER_LIMITS.minTalentDensity.max}
          step={FILTER_LIMITS.minTalentDensity.step}
          accent="#3ecf8e"
          onChange={(minTalentDensity) => onChange({ minTalentDensity })}
        />
      </FilterRow>

      <FilterRow
        label="Competitor Saturation"
        valueLabel={formatMaxScore(filters.maxCompetitorSaturation)}
      >
        <RangeSlider
          value={filters.maxCompetitorSaturation}
          min={FILTER_LIMITS.maxCompetitorSaturation.min}
          max={FILTER_LIMITS.maxCompetitorSaturation.max}
          step={FILTER_LIMITS.maxCompetitorSaturation.step}
          accent="#d96b6b"
          onChange={(maxCompetitorSaturation) => onChange({ maxCompetitorSaturation })}
        />
      </FilterRow>

      <FilterRow
        label="Regulatory Ease Floor"
        valueLabel={formatMinScore(filters.minRegulatoryEase)}
      >
        <RangeSlider
          value={filters.minRegulatoryEase}
          min={FILTER_LIMITS.minRegulatoryEase.min}
          max={FILTER_LIMITS.minRegulatoryEase.max}
          step={FILTER_LIMITS.minRegulatoryEase.step}
          accent="#9b7bde"
          onChange={(minRegulatoryEase) => onChange({ minRegulatoryEase })}
        />
      </FilterRow>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 280,
    backgroundColor: '#0e0e16',
    borderRightWidth: 1,
    borderRightColor: '#1c1c2a',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 18,
    flexShrink: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  reset: {
    color: '#7aa2ff',
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    gap: 8,
  },
  verticalRow: {
    zIndex: 40,
    elevation: 40,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '500',
  },
  rowValue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  sliderTrackWrap: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#232336',
    overflow: 'hidden',
  },
  sliderTrackFill: {
    height: 4,
    borderRadius: 2,
  },
  nativeSliderFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 28,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1a1a28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#1e2a44',
    borderColor: '#3d8bfd',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
  },
});
