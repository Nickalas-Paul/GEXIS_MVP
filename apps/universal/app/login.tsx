import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';
import { ApiError, getApiUrl } from '@/services/api';
import { useAuth } from '@/services/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/explorer" />;
  }

  async function onSubmit() {
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmed, password);
      router.replace('/explorer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <View style={styles.card}>
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.subtitle}>Access your GEXIS workspace.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
          placeholderTextColor="#9a9a96"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#9a9a96"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryBtn, submitting && styles.btnDisabled]}
          onPress={() => void onSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryBtnText}>Log in</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => void Linking.openURL(`${getApiUrl()}/api/auth/google`)}
        >
          <Text style={styles.secondaryBtnText}>Continue with Google</Text>
        </Pressable>

        <Link href="/register" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>Create account</Text>
          </Pressable>
        </Link>
      </View>
    </MarketingShell>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.65,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: {
    color: '#b42318',
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  linkRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  linkText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '500',
  },
});
