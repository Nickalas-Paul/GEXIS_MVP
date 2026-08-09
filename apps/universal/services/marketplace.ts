import { type AgentCard } from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';

export type MarketplaceQuery = {
  geography?: string;
  category?: string;
  vertical?: string;
  query?: string;
  sort?: 'rating' | 'engagements' | 'response_time';
  page?: number;
  limit?: number;
};

export type MarketplaceResponse = {
  agents: AgentCard[];
  facets: { categories: Record<string, number> };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ApiEnvelope<T> = {
  data: T;
};

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

/** Public marketplace directory search / filter / sort. */
export async function searchMarketplace(
  params: MarketplaceQuery
): Promise<MarketplaceResponse> {
  const qs = new URLSearchParams();
  if (params.geography) qs.set('geography', params.geography);
  if (params.category) qs.set('category', params.category);
  if (params.vertical) qs.set('vertical', params.vertical);
  if (params.query) qs.set('query', params.query);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page != null) qs.set('page', String(params.page));
  if (params.limit != null) qs.set('limit', String(params.limit));

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const response = await fetch(
    `${getApiUrl()}/api/marketplace/agents${suffix}`,
    { method: 'GET' }
  );
  const json = await parseJson<ApiEnvelope<MarketplaceResponse>>(response);
  return json.data;
}
