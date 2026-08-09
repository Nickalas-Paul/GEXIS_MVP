/**
 * Industry vertical keys and labels (Phase 7).
 *
 * Shared vocabulary for server and client. Scoring weights remain in
 * server/api/src/config/mvi.ts (and server/workers/scoring_config.py).
 */

export const INDUSTRY_VERTICAL_KEYS = [
  'all',
  'tech_saas',
  'financial',
  'manufacturing',
  'healthcare',
  'ecommerce',
  'energy',
  'professional',
  'logistics',
  'telecom',
  'consumer_goods',
] as const;

export type IndustryVerticalKey = (typeof INDUSTRY_VERTICAL_KEYS)[number];

export const INDUSTRY_VERTICAL_LABELS: Record<IndustryVerticalKey, string> = {
  all: 'All Industries',
  tech_saas: 'Technology & SaaS',
  financial: 'Financial Services',
  manufacturing: 'Manufacturing',
  healthcare: 'Healthcare & Life Sciences',
  ecommerce: 'E-Commerce & Retail',
  energy: 'Energy & Renewables',
  professional: 'Professional Services',
  logistics: 'Logistics & Supply Chain',
  telecom: 'Telecommunications',
  consumer_goods: 'Consumer Goods & CPG',
};

/**
 * Vertical keys available for agent profile selection.
 * Excludes 'all' — agents specialize in specific verticals, not "all industries."
 */
export const AGENT_SELECTABLE_VERTICALS = INDUSTRY_VERTICAL_KEYS.filter(
  (k): k is Exclude<IndustryVerticalKey, 'all'> => k !== 'all'
);
