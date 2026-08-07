/**
 * Shared API response helpers.
 */

export function toCamelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toCamelCase(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = toCamelCaseKey(key);
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[camel] = toCamelCase(value as Record<string, unknown>);
    } else {
      out[camel] = value;
    }
  }
  return out;
}

export function apiResponse<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { data, meta } : { data };
}

export function apiError(message: string) {
  return { error: message };
}
