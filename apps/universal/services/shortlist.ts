import {
  type AgentCategory,
  type ResponseTime,
  type ShortlistEntry,
} from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

/** Shortlist row joined with agent card fields (matches API). */
export type ShortlistWithAgent = ShortlistEntry & {
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
};

type ApiEnvelope<T> = {
  data: T;
};

async function authHeaders(): Promise<Headers> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = await getStoredAccessToken();
  if (!token) {
    throw new ApiError(401, 'Not authenticated');
  }
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Get the current user's shortlist. */
export async function getShortlist(): Promise<ShortlistWithAgent[]> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/shortlist`, {
    method: 'GET',
    headers,
  });
  const json = await parseJson<ApiEnvelope<ShortlistWithAgent[]>>(response);
  return json.data;
}

/** Add an agent to the shortlist. */
export async function addToShortlist(agentId: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/shortlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ agentId }),
  });
  await parseJson<ApiEnvelope<ShortlistWithAgent>>(response);
}

/** Remove an agent from the shortlist. */
export async function removeFromShortlist(agentId: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/shortlist/${encodeURIComponent(agentId)}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  await parseJson<void>(response);
}
