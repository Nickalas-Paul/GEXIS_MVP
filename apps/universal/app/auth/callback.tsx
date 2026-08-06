import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/services/auth';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    accessToken?: string | string[];
    refreshToken?: string | string[];
  }>();
  const { setSession, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const accessToken = Array.isArray(params.accessToken)
      ? params.accessToken[0]
      : params.accessToken;
    const refreshToken = Array.isArray(params.refreshToken)
      ? params.refreshToken[0]
      : params.refreshToken;

    if (!accessToken || !refreshToken) {
      setError('Missing OAuth tokens in callback URL');
      return;
    }

    (async () => {
      try {
        await setSession(accessToken, refreshToken);
        setDone(true);
      } catch {
        setError('Failed to establish session from OAuth callback');
      }
    })();
  }, [params.accessToken, params.refreshToken, setSession]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Redirect href="/login" />
      </View>
    );
  }

  if (done || isAuthenticated) {
    return <Redirect href="/explorer" />;
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#1a1a1a" />
      <Text style={styles.copy}>Completing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f7f7f5',
    padding: 24,
  },
  copy: {
    fontSize: 15,
    opacity: 0.7,
  },
  error: {
    color: '#b42318',
    marginBottom: 12,
  },
});
