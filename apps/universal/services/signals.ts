/**
 * Market signals client — Layer 2 events & prediction markets.
 */

import type { MarketSignal, SignalSummaryMap } from '@gexis/gexis-core';
import { getApiUrl } from './api';

interface SignalsListPayload {
  signals?: MarketSignal[];
  count?: number;
}

interface Envelope {
  data?: MarketSignal[] | SignalsListPayload;
  count?: number;
  success?: boolean;
  error?: string;
}

interface SummaryEnvelope {
  data?: SignalSummaryMap;
  success?: boolean;
  error?: string;
}

function unwrapSignals(json: Envelope): { signals: MarketSignal[]; count: number } {
  const raw = json.data;
  if (Array.isArray(raw)) {
    return {
      signals: raw,
      count: typeof json.count === 'number' ? json.count : raw.length,
    };
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.signals)) {
    return {
      signals: raw.signals,
      count: typeof raw.count === 'number' ? raw.count : raw.signals.length,
    };
  }
  return { signals: [], count: 0 };
}

/**
 * Active signals for one geography (UUID or ISO3). Additive — never throws for UI.
 */
export async function getGeographySignals(
  geographyId: string
): Promise<{ signals: MarketSignal[]; count: number }> {
  const url = `${getApiUrl()}/api/signals?geographyId=${encodeURIComponent(geographyId)}&active=true&limit=10`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { signals: [], count: 0 };
    }
    const json = (await res.json()) as Envelope;
    return unwrapSignals(json);
  } catch {
    return { signals: [], count: 0 };
  }
}

/**
 * Active signal counts keyed by geography ISO3. Empty object on failure.
 */
export async function getSignalsSummary(): Promise<SignalSummaryMap> {
  const url = `${getApiUrl()}/api/signals/summary`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {};
    }
    const json = (await res.json()) as SummaryEnvelope;
    return json.data && typeof json.data === 'object' ? json.data : {};
  } catch {
    return {};
  }
}
