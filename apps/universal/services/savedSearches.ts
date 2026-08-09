import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/saved-searches`, {
    method: 'GET',
    headers,
  });
  const json = await parseJson<ApiEnvelope<SavedSearch[]>>(response);
  return json.data ?? [];
}

export async function createSavedSearch(
  name: string,
  filters: Record<string, unknown>
): Promise<SavedSearch> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/saved-searches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, filters }),
  });
  const json = await parseJson<ApiEnvelope<SavedSearch>>(response);
  return json.data;
}

export async function updateSavedSearch(
  id: string,
  data: { name?: string; filters?: Record<string, unknown> }
): Promise<SavedSearch> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/saved-searches/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    }
  );
  const json = await parseJson<ApiEnvelope<SavedSearch>>(response);
  return json.data;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/saved-searches/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  await parseJson<void>(response);
}