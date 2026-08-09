/**
 * Display helpers for Layer 2 market signals in the explorer UI.
 */

import type { MarketSignal, SignalDirection } from '@gexis/gexis-core';

const DIM_SHORT: Record<string, string> = {
  marketSizeAndGrowth: 'Market',
  talentDensity: 'Talent',
  taxEnvironment: 'Tax',
  regulatoryEase: 'Regulatory',
  infrastructure: 'Infrastructure',
  competitorSaturation: 'Competition',
  trajectory: 'Trajectory',
};

export function shortDimensionLabels(dims: string[] | null | undefined): string {
  if (!dims?.length) return '';
  return dims.map((d) => DIM_SHORT[d] ?? d).join(', ');
}

export function shortDimensionList(dims: string[] | null | undefined): string[] {
  if (!dims?.length) return [];
  return dims.map((d) => DIM_SHORT[d] ?? d);
}

export function signalAccent(direction: SignalDirection): {
  dot: string;
  cardBg: string;
  pillBg: string;
  pillText: string;
} {
  if (direction === 'negative') {
    return {
      dot: '#f59e0b',
      cardBg: 'rgba(245, 158, 11, 0.06)',
      pillBg: 'rgba(245, 158, 11, 0.12)',
      pillText: '#f59e0b',
    };
  }
  if (direction === 'positive') {
    return {
      dot: '#22d3ee',
      cardBg: 'rgba(34, 211, 238, 0.04)',
      pillBg: 'rgba(34, 211, 238, 0.12)',
      pillText: '#22d3ee',
    };
  }
  return {
    dot: '#9ca3af',
    cardBg: 'rgba(156, 163, 175, 0.06)',
    pillBg: 'rgba(156, 163, 175, 0.12)',
    pillText: '#9ca3af',
  };
}

export function formatRelativeFetchedAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Updated recently';
  const hours = Math.max(0, Math.round((Date.now() - t) / 3_600_000));
  if (hours < 1) return 'Updated just now';
  if (hours === 1) return 'Updated 1h ago';
  if (hours < 48) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

export function formatProbabilityPct(p: number | null | undefined): string | null {
  if (p == null || Number.isNaN(Number(p))) return null;
  const n = Number(p);
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}% prob`;
}

export function directionLabel(direction: SignalDirection): string {
  if (direction === 'positive') return 'Positive';
  if (direction === 'negative') return 'Negative';
  return 'Neutral';
}

/** MaterialCommunityIcons name closest to the Tabler mapping in the spec. */
export function signalTypeIcon(signalType: string): string {
  switch (signalType) {
    case 'tariff_risk':
      return 'receipt';
    case 'sanctions':
      return 'cancel';
    case 'trade_agreement':
      return 'handshake';
    case 'regulatory_change':
      return 'gavel';
    case 'political_instability':
      return 'alert';
    case 'currency_crisis':
      return 'currency-usd';
    case 'natural_disaster':
      return 'weather-lightning';
    case 'economic_policy':
      return 'bank';
    case 'labor_unrest':
      return 'account-group';
    case 'infrastructure_event':
      return 'road-variant';
    default:
      return 'information-outline';
  }
}

export function sourceDisplayLabel(source: string): string {
  const map: Record<string, string> = {
    polymarket: 'Polymarket',
    gdelt: 'GDELT',
    gdelt_seed: 'GDELT',
  };
  return map[source] ?? source;
}

export type { MarketSignal };
