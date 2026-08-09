import {
  type Agent,
  type AgentCategory,
  type ResponseTime,
} from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

export type CreateAgentInput = {
  name: string;
  company?: string;
  category: AgentCategory;
  customCategory?: string;
  industryVerticals?: string[];
  domainTags?: string[];
  bio?: string;
  website?: string;
  geographyIds?: string[];
  responseTime?: ResponseTime | string;
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

/** Create a new agent profile. */
export async function createAgentProfile(
  data: CreateAgentInput
): Promise<Agent> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const json = await parseJson<ApiEnvelope<Agent>>(response);
  return json.data;
}

/** Get the current user's agent profile. Returns null if no profile exists. */
export async function getMyAgentProfile(): Promise<Agent | null> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/agents/me`, {
    method: 'GET',
    headers,
  });
  if (response.status === 404) {
    return null;
  }
  const json = await parseJson<ApiEnvelope<Agent>>(response);
  return json.data;
}

/** Get an agent by ID (public). */
export async function getAgentById(id: string): Promise<Agent> {
  const response = await fetch(
    `${getApiUrl()}/api/agents/${encodeURIComponent(id)}`,
    { method: 'GET' }
  );
  const json = await parseJson<ApiEnvelope<Agent>>(response);
  return json.data;
}

/** Update an agent profile. */
export async function updateAgentProfile(
  id: string,
  data: Partial<CreateAgentInput>
): Promise<Agent> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/agents/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    }
  );
  const json = await parseJson<ApiEnvelope<Agent>>(response);
  return json.data;
}
