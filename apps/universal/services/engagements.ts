import { type AgentEngagement } from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

type ApiEnvelope<T> = {
  data: T;
};

export type CreateEngagementInput = {
  agentId: string;
  businessDescription?: string;
  expansionGoals?: string;
  timeline?: string;
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
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
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

/** Request an introduction with an agent (marketplace tier). */
export async function createEngagement(
  data: CreateEngagementInput
): Promise<AgentEngagement> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/engagements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const json = await parseJson<ApiEnvelope<AgentEngagement>>(response);
  return json.data;
}

/** List engagements for the current user as requester or agent. */
export async function listEngagements(
  role: 'requester' | 'agent',
  status?: string
): Promise<AgentEngagement[]> {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ role });
  if (status) qs.set('status', status);
  const response = await fetch(
    `${getApiUrl()}/api/engagements?${qs.toString()}`,
    { method: 'GET', headers }
  );
  const json = await parseJson<ApiEnvelope<AgentEngagement[]>>(response);
  return json.data;
}

/** Agent accepts or declines a requested engagement. */
export async function respondToEngagement(
  id: string,
  response: 'accepted' | 'declined'
): Promise<AgentEngagement> {
  const headers = await authHeaders();
  const res = await fetch(
    `${getApiUrl()}/api/engagements/${encodeURIComponent(id)}/respond`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ response }),
    }
  );
  const json = await parseJson<ApiEnvelope<AgentEngagement>>(res);
  return json.data;
}

/** Advance engagement status to active or completed. */
export async function updateEngagementStatus(
  id: string,
  status: 'active' | 'completed'
): Promise<AgentEngagement> {
  const headers = await authHeaders();
  const res = await fetch(
    `${getApiUrl()}/api/engagements/${encodeURIComponent(id)}/status`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status }),
    }
  );
  const json = await parseJson<ApiEnvelope<AgentEngagement>>(res);
  return json.data;
}
