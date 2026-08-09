/**
 * Agent marketplace shared types and catalogs (Phase 7).
 *
 * Consumed by both server and client. Keep aligned with DB constraints
 * on agents.category, agents.response_time, and agent_engagements.status.
 */

export const AGENT_CATEGORY_KEYS = [
  'commercial_real_estate',
  'permitting_compliance',
  'legal_counsel',
  'supply_chain_3pl',
  'workforce_recruiting',
  'other',
] as const;

export type AgentCategory = (typeof AGENT_CATEGORY_KEYS)[number];

export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
  commercial_real_estate: 'Commercial Real Estate',
  permitting_compliance: 'Permitting & Compliance',
  legal_counsel: 'Legal Counsel',
  supply_chain_3pl: 'Supply Chain / 3PL',
  workforce_recruiting: 'Workforce Recruiting',
  other: 'Other',
};

export const ENGAGEMENT_STATUS_KEYS = [
  'requested',
  'accepted',
  'declined',
  'active',
  'completed',
] as const;

export type EngagementStatus = (typeof ENGAGEMENT_STATUS_KEYS)[number];

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  declined: 'Declined',
  active: 'Active',
  completed: 'Completed',
};

export const RESPONSE_TIME_KEYS = ['<24h', '1-3d', '3-7d', '7d+'] as const;

export type ResponseTime = (typeof RESPONSE_TIME_KEYS)[number];

export const RESPONSE_TIME_LABELS: Record<ResponseTime, string> = {
  '<24h': 'Under 24 hours',
  '1-3d': '1–3 days',
  '3-7d': '3–7 days',
  '7d+': '7+ days',
};

/** Explicit sort order for response_time (lower = faster = better). */
export const RESPONSE_TIME_SORT_ORDER: Record<ResponseTime, number> = {
  '<24h': 1,
  '1-3d': 2,
  '3-7d': 3,
  '7d+': 4,
};

/** Agent profile as stored and returned by the API. */
export interface Agent {
  id: string;
  userId: string | null;
  name: string;
  company: string | null;
  category: AgentCategory;
  customCategory: string | null;
  geographyIds: string[];
  verified: boolean;
  rating: number;
  engagementCount: number;
  responseTime: ResponseTime | null;
  industryVerticals: string[];
  domainTags: string[];
  specializations: unknown | null;
  bio: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Subset of Agent fields returned in marketplace directory cards. */
export interface AgentCard {
  id: string;
  name: string;
  company: string | null;
  category: AgentCategory;
  customCategory: string | null;
  verified: boolean;
  rating: number;
  engagementCount: number;
  responseTime: ResponseTime | null;
  industryVerticals: string[];
  domainTags: string[];
  geographyIds: string[];
}

/** Agent engagement request. */
export interface AgentEngagement {
  id: string;
  agentId: string;
  userId: string;
  status: EngagementStatus;
  businessDescription: string | null;
  expansionGoals: string | null;
  timeline: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Extended engagement with joined context for display. */
export interface EngagementWithContext extends AgentEngagement {
  agentName?: string;
  agentCompany?: string | null;
  requesterEmail?: string;
}

/** Agent review. */
export interface AgentReview {
  id: string;
  agentId: string;
  userId: string;
  rating: number;
  reviewText: string | null;
  engagementType: string | null;
  createdAt: string;
}

/** User shortlist entry. */
export interface ShortlistEntry {
  id: string;
  userId: string;
  agentId: string;
  createdAt: string;
}

export const NOTIFICATION_TYPES = [
  'engagement_requested',
  'engagement_accepted',
  'engagement_declined',
  'engagement_active',
  'engagement_completed',
  'market_event',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Notification as returned by the API. */
export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Returns the display label for an agent's category, using customCategory for 'other'. */
export function getAgentCategoryLabel(
  category: AgentCategory,
  customCategory?: string | null
): string {
  if (category === 'other' && customCategory) {
    return customCategory;
  }
  return AGENT_CATEGORY_LABELS[category];
}
