import { type AgentReview } from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

type ApiEnvelope<T> = {
  data: T;
};

export type SubmitReviewInput = {
  rating: number;
  reviewText?: string;
  engagementType?: string;
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

/** Public list of reviews for an agent. */
export async function getAgentReviews(
  agentId: string
): Promise<AgentReview[]> {
  const response = await fetch(
    `${getApiUrl()}/api/agents/${encodeURIComponent(agentId)}/reviews`,
    { method: 'GET' }
  );
  const json = await parseJson<ApiEnvelope<AgentReview[]>>(response);
  return json.data;
}

/** Submit a review after a completed engagement (auth required). */
export async function submitReview(
  agentId: string,
  data: SubmitReviewInput
): Promise<AgentReview> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/agents/${encodeURIComponent(agentId)}/reviews`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    }
  );
  const json = await parseJson<ApiEnvelope<AgentReview>>(response);
  return json.data;
}
