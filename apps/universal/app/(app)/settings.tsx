import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTierAccess } from '@/hooks/useTierAccess';
import * as api from '@/services/api';
import { useAuth } from '@/services/auth';

const TIER_OPTIONS: api.SubscriptionTierName[] = ['free', 'pro', 'marketplace'];

function formatMemberSince(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SettingsScreen() {
  const { user, accessToken, logout, refreshAuth } = useAuth();
  const { currentTier, gatingEnabled } = useTierAccess();
  const [busyTier, setBusyTier] = useState<api.SubscriptionTierName | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSetTier = async (tier: api.SubscriptionTierName) => {
    if (!accessToken || tier === currentTier || busyTier) return;
    setBusyTier(tier);
    setError(null);
    setMessage(null);
    try {
      await api.setDevTier(accessToken, tier);
      const ok = await refreshAuth();
      if (!ok) {
        setError('Tier updated, but session refresh failed. Log in again.');
        return;
      }
      setMessage(`Tier set to ${tier}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tier');
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACCOUNT</Text>
          <Text style={styles.email}>{user?.email ?? '-'}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Current tier</Text>
            <Text style={styles.metaVal}>{currentTier.toUpperCase()}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Member since</Text>
            <Text style={styles.metaVal}>
              {formatMemberSince(user?.createdAt)}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Gating</Text>
            <Text style={styles.metaVal}>
              {gatingEnabled ? 'ON' : 'OFF (beta)'}
            </Text>
          </View>
        </View>

        {__DEV__ ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DEVELOPER TOOLS</Text>
            <Text style={styles.devNote}>(dev mode only)</Text>
            <Text style={styles.devCurrent}>
              Active: {currentTier.toUpperCase()}
            </Text>
            <View style={styles.tierRow}>
              {TIER_OPTIONS.map((tier) => {
                const active = currentTier === tier;
                const busy = busyTier === tier;
                return (
                  <Pressable
                    key={tier}
                    disabled={active || busyTier != null}
                    onPress={() => void onSetTier(tier)}
                    style={[
                      styles.tierBtn,
                      active && styles.tierBtnActive,
                      !active && busyTier != null && styles.tierBtnDisabled,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.tierBtnText,
                          active && styles.tierBtnTextActive,
                        ]}
                      >
                        Set {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>MARKETPLACE</Text>
          <Link href="/engagements" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>My Engagements</Text>
            </Pressable>
          </Link>
          <Link href="/notifications" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>Notifications</Text>
            </Pressable>
          </Link>
        </View>

        <Pressable
          style={styles.logoutBtn}
          onPress={() => {
            void logout();
          }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0b12',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#14141f',
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  email: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaKey: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  metaVal: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  devNote: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: -4,
  },
  devCurrent: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
  },
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierBtn: {
    flexGrow: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    backgroundColor: '#1a1a28',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tierBtnActive: {
    backgroundColor: '#1a3a6e',
    borderColor: '#3b82f6',
  },
  tierBtnDisabled: {
    opacity: 0.45,
  },
  tierBtnText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  tierBtnTextActive: {
    color: '#c8dcff',
  },
  success: {
    color: '#3ecf8e',
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: '#d96b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  linkRow: {
    paddingVertical: 10,
  },
  linkText: {
    color: '#8eb6ff',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logoutText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});