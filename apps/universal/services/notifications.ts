import { type AppNotification } from '@gexis/gexis-core';

import { ApiError, getApiUrl } from '@/services/api';
import { getStoredAccessToken } from '@/services/tokenStorage';

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

/** List notifications for the current user. */
export async function getNotifications(): Promise<AppNotification[]> {
  const headers = await authHeaders();
  const response = await fetch(`${getApiUrl()}/api/notifications`, {
    method: 'GET',
    headers,
  });
  const json = await parseJson<ApiEnvelope<AppNotification[]>>(response);
  return json.data;
}

/** Unread notification count for the badge. */
export async function getUnreadCount(): Promise<number> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/notifications/unread-count`,
    { method: 'GET', headers }
  );
  const json = await parseJson<ApiEnvelope<{ count: number }>>(response);
  return json.data.count;
}

/** Mark a single notification as read. */
export async function markAsRead(id: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/notifications/${encodeURIComponent(id)}/read`,
    { method: 'PUT', headers }
  );
  await parseJson<ApiEnvelope<AppNotification>>(response);
}

/** Mark all notifications as read. */
export async function markAllAsRead(): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(
    `${getApiUrl()}/api/notifications/read-all`,
    { method: 'PUT', headers }
  );
  await parseJson<ApiEnvelope<{ updated: number }>>(response);
}
