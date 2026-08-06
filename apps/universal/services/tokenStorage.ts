import { Platform } from 'react-native';

const REFRESH_KEY = 'gexis_refresh_token';
const ACCESS_KEY = 'gexis_access_token';

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

async function getSecureStore() {
  return import('expo-secure-store');
}

function webGet(key: string): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  return sessionStorage.getItem(key);
}

function webSet(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(key, value);
}

function webRemove(key: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(key);
}

export async function getStoredAccessToken(): Promise<string | null> {
  if (memoryAccessToken) {
    return memoryAccessToken;
  }
  if (Platform.OS === 'web') {
    // Access stays primarily in memory; sessionStorage covers page reloads.
    memoryAccessToken = webGet(ACCESS_KEY);
    return memoryAccessToken;
  }
  return memoryAccessToken;
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (memoryRefreshToken) {
    return memoryRefreshToken;
  }

  if (Platform.OS === 'web') {
    memoryRefreshToken = webGet(REFRESH_KEY);
    return memoryRefreshToken;
  }

  try {
    const SecureStore = await getSecureStore();
    memoryRefreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    return memoryRefreshToken;
  } catch {
    return null;
  }
}

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  memoryAccessToken = accessToken;
  memoryRefreshToken = refreshToken;

  if (Platform.OS === 'web') {
    // Memory + sessionStorage so browser refresh can silent-refresh.
    webSet(ACCESS_KEY, accessToken);
    webSet(REFRESH_KEY, refreshToken);
    return;
  }

  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  } catch {
    // Keep in-memory tokens if secure store fails.
  }
}

export async function clearTokens(): Promise<void> {
  memoryAccessToken = null;
  memoryRefreshToken = null;

  if (Platform.OS === 'web') {
    webRemove(ACCESS_KEY);
    webRemove(REFRESH_KEY);
    return;
  }

  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(ACCESS_KEY);
  } catch {
    // ignore
  }
}
