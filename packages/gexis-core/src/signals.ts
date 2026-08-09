/**
 * Market signal types — Layer 2 event/prediction overlays on MVI scores.
 */

export type SignalDirection = "positive" | "negative" | "neutral";

export interface MarketSignal {
  id: string;
  source: string;
  signalType: string;
  title: string;
  description: string | null;
  probability: number | null;
  severity: number;
  direction: SignalDirection;
  affectedDimensions: string[];
  eventUrl: string | null;
  fetchedAt: string;
  expiresAt: string | null;
}

/** Geography ISO3 → active signal count (summary endpoint). */
export type SignalSummaryMap = Record<string, number>;
