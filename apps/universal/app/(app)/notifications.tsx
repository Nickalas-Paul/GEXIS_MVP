import { type AppNotification } from '@gexis/gexis-core';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getNotifications,
  markAllAsRead,
  markAsRead,
} from '@/services/notifications';

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function notificationHref(n: AppNotification): string {
  const meta = n.metadata ?? {};
  if (
    n.type === 'engagement_requested' ||
    n.type === 'engagement_accepted' ||
    n.type === 'engagement_declined' ||
    n.type === 'engagement_active' ||
    n.type === 'engagement_completed'
  ) {
    return '/engagements';
  }
  if (typeof meta.agentId === 'string' && meta.agentId) {
    return `/marketplace/${meta.agentId}`;
  }
  return '/engagements';
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getNotifications();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onMarkAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all read');
    } finally {
      setBusy(false);
    }
  };

  const onOpen = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await markAsRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
        );
      } catch {
        // still navigate
      }
    }
    router.push(notificationHref(n) as '/engagements');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Notifications</Text>
          <Pressable
            testID="mark-all-read"
            onPress={() => void onMarkAll()}
            disabled={busy}
          >
            <Text style={styles.markAll}>Mark all as read</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#1a1a1a" />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && items.length === 0 ? (
          <Text style={styles.empty}>No notifications yet.</Text>
        ) : null}

        {items.map((n) => (
          <Pressable
            key={n.id}
            testID={`notification-${n.id}`}
            style={[styles.card, !n.read && styles.cardUnread]}
            onPress={() => void onOpen(n)}
          >
            <View style={styles.cardTop}>
              {!n.read ? <View style={styles.dot} /> : null}
              <Text style={styles.cardTitle}>{n.title}</Text>
            </View>
            {n.message ? (
              <Text style={styles.cardMessage}>{n.message}</Text>
            ) : null}
            <Text style={styles.cardTime}>{relativeTime(n.createdAt)}</Text>
          </Pressable>
        ))}

        <Link href="/engagements" style={styles.link}>
          Go to My Engagements
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f5' },
  content: {
    padding: 24,
    gap: 12,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  markAll: { fontSize: 14, fontWeight: '600', color: '#0b57d0' },
  centered: { paddingVertical: 40, alignItems: 'center' },
  error: { color: '#b42318', fontSize: 14 },
  empty: { color: '#6b6b6b', fontSize: 15, paddingVertical: 24 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  cardUnread: {
    backgroundColor: '#f3f7ff',
    borderColor: '#c9d8f5',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c62828',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  cardMessage: { fontSize: 14, color: '#4a4a4a', lineHeight: 20 },
  cardTime: { fontSize: 12, color: '#6b6b6b' },
  link: { marginTop: 8, fontSize: 14, color: '#0b57d0' },
});
