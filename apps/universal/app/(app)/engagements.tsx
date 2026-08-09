import {
  ENGAGEMENT_STATUS_LABELS,
  type EngagementStatus,
  type EngagementWithContext,
} from '@gexis/gexis-core';
import { Link, useFocusEffect } from 'expo-router';
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

import { getMyAgentProfile } from '@/services/agents';
import {
  listEngagements,
  respondToEngagement,
  updateEngagementStatus,
} from '@/services/engagements';

type Tab = 'requests' | 'incoming';

const STATUS_COLORS: Record<
  EngagementStatus,
  { bg: string; fg: string }
> = {
  requested: { bg: '#fff3cd', fg: '#856404' },
  accepted: { bg: '#cfe2ff', fg: '#084298' },
  declined: { bg: '#f8d7da', fg: '#842029' },
  active: { bg: '#d1e7dd', fg: '#0f5132' },
  completed: { bg: '#e9ecef', fg: '#495057' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default function EngagementsScreen() {
  const [tab, setTab] = useState<Tab>('requests');
  const [hasAgent, setHasAgent] = useState<boolean | null>(null);
  const [items, setItems] = useState<EngagementWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null);

  const load = useCallback(async (activeTab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'incoming') {
        const profile = await getMyAgentProfile();
        setHasAgent(Boolean(profile));
        if (!profile) {
          setItems([]);
          return;
        }
        const list = await listEngagements('agent');
        setItems(list);
      } else {
        const list = await listEngagements('requester');
        setItems(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [load, tab])
  );

  const onRespond = async (id: string, response: 'accepted' | 'declined') => {
    if (busyId) return;
    if (response === 'declined' && confirmDeclineId !== id) {
      setConfirmDeclineId(id);
      return;
    }
    setBusyId(id);
    setConfirmDeclineId(null);
    try {
      await respondToEngagement(id, response);
      await load('incoming');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onAdvance = async (id: string, status: 'active' | 'completed') => {
    if (busyId) return;
    setBusyId(id);
    try {
      await updateEngagementStatus(id, status);
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>My Engagements</Text>
        <Text style={styles.subtitle}>
          Track introduction requests you sent and received.
        </Text>

        <View style={styles.tabs}>
          <Pressable
            testID="tab-requests"
            style={[styles.tab, tab === 'requests' && styles.tabActive]}
            onPress={() => setTab('requests')}
          >
            <Text
              style={[
                styles.tabText,
                tab === 'requests' && styles.tabTextActive,
              ]}
            >
              My Requests
            </Text>
          </Pressable>
          <Pressable
            testID="tab-incoming"
            style={[styles.tab, tab === 'incoming' && styles.tabActive]}
            onPress={() => setTab('incoming')}
          >
            <Text
              style={[
                styles.tabText,
                tab === 'incoming' && styles.tabTextActive,
              ]}
            >
              Incoming Requests
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#1a1a1a" size="large" />
          </View>
        ) : null}

        {!loading && tab === 'incoming' && hasAgent === false ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              You don&apos;t have an agent profile
            </Text>
            <Text style={styles.emptyCopy}>
              Become an agent to receive introduction requests.
            </Text>
            <Link href="/marketplace/onboard" style={styles.link}>
              Become an Agent
            </Link>
          </View>
        ) : null}

        {!loading &&
        !(tab === 'incoming' && hasAgent === false) &&
        items.length === 0 ? (
          <View style={styles.emptyBox}>
            {tab === 'requests' ? (
              <>
                <Text style={styles.emptyTitle}>No requests yet</Text>
                <Text style={styles.emptyCopy}>
                  You haven&apos;t requested any introductions yet. Browse the
                  marketplace to find agents.
                </Text>
                <Link href="/marketplace" style={styles.link}>
                  Browse marketplace
                </Link>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No introduction requests yet.</Text>
              </>
            )}
          </View>
        ) : null}

        {!loading &&
          items.map((eng) => {
            const colors = STATUS_COLORS[eng.status];
            const busy = busyId === eng.id;
            return (
              <View
                key={eng.id}
                style={styles.card}
                testID={`engagement-${eng.id}`}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>
                    {tab === 'requests'
                      ? eng.agentName ?? 'Agent'
                      : eng.requesterEmail ?? 'A business'}
                  </Text>
                  <View
                    style={[styles.statusChip, { backgroundColor: colors.bg }]}
                  >
                    <Text style={[styles.statusText, { color: colors.fg }]}>
                      {ENGAGEMENT_STATUS_LABELS[eng.status]}
                    </Text>
                  </View>
                </View>

                {tab === 'requests' && eng.agentCompany ? (
                  <Text style={styles.meta}>{eng.agentCompany}</Text>
                ) : null}

                <Text style={styles.body}>
                  {truncate(eng.businessDescription)}
                </Text>
                {eng.expansionGoals ? (
                  <Text style={styles.meta}>
                    Goals: {truncate(eng.expansionGoals, 100)}
                  </Text>
                ) : null}
                {eng.timeline ? (
                  <Text style={styles.meta}>Timeline: {eng.timeline}</Text>
                ) : null}
                <Text style={styles.date}>
                  {tab === 'requests' ? 'Submitted' : 'Received'}{' '}
                  {formatDate(eng.createdAt)}
                </Text>

                <View style={styles.actions}>
                  {tab === 'requests' ? (
                    <>
                      {eng.status === 'requested' ? (
                        <Text style={styles.pending}>Pending</Text>
                      ) : null}
                      {eng.status === 'accepted' ? (
                        <Pressable
                          testID={`mark-active-${eng.id}`}
                          style={styles.primaryBtn}
                          disabled={busy}
                          onPress={() => void onAdvance(eng.id, 'active')}
                        >
                          <Text style={styles.primaryBtnText}>Mark Active</Text>
                        </Pressable>
                      ) : null}
                      {eng.status === 'active' ? (
                        <Pressable
                          testID={`mark-completed-${eng.id}`}
                          style={styles.primaryBtn}
                          disabled={busy}
                          onPress={() => void onAdvance(eng.id, 'completed')}
                        >
                          <Text style={styles.primaryBtnText}>
                            Mark Completed
                          </Text>
                        </Pressable>
                      ) : null}
                      {eng.status === 'completed' ? (
                        <Link
                          href={`/marketplace/${eng.agentId}`}
                          style={styles.link}
                          testID={`leave-review-${eng.id}`}
                        >
                          Leave a Review
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {eng.status === 'requested' ? (
                        <>
                          <Pressable
                            testID={`accept-${eng.id}`}
                            style={styles.acceptBtn}
                            disabled={busy}
                            onPress={() => void onRespond(eng.id, 'accepted')}
                          >
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          </Pressable>
                          <Pressable
                            testID={`decline-${eng.id}`}
                            style={styles.declineBtn}
                            disabled={busy}
                            onPress={() => void onRespond(eng.id, 'declined')}
                          >
                            <Text style={styles.declineBtnText}>
                              {confirmDeclineId === eng.id
                                ? 'Confirm Decline'
                                : 'Decline'}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}
                      {eng.status === 'accepted' ? (
                        <Pressable
                          style={styles.primaryBtn}
                          disabled={busy}
                          onPress={() => void onAdvance(eng.id, 'active')}
                        >
                          <Text style={styles.primaryBtnText}>Mark Active</Text>
                        </Pressable>
                      ) : null}
                      {eng.status === 'active' ? (
                        <Pressable
                          style={styles.primaryBtn}
                          disabled={busy}
                          onPress={() => void onAdvance(eng.id, 'completed')}
                        >
                          <Text style={styles.primaryBtnText}>
                            Mark Completed
                          </Text>
                        </Pressable>
                      ) : null}
                      {eng.status === 'completed' ? (
                        <Text style={styles.pending}>Completed</Text>
                      ) : null}
                      {eng.status === 'declined' ? (
                        <Text style={styles.pending}>Declined</Text>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f5' },
  content: {
    padding: 24,
    gap: 14,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 48,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 15, color: '#6b6b6b', marginTop: -6 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#3a3a3a' },
  tabTextActive: { color: '#ffffff' },
  centered: { paddingVertical: 40, alignItems: 'center' },
  error: { color: '#b42318', fontSize: 14 },
  emptyBox: { gap: 8, paddingVertical: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  emptyCopy: { fontSize: 15, color: '#4a4a4a', lineHeight: 22 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b6b6b' },
  body: { fontSize: 14, color: '#3a3a3a', lineHeight: 20 },
  date: { fontSize: 12, color: '#6b6b6b' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  pending: { fontSize: 13, fontWeight: '600', color: '#6b6b6b' },
  primaryBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  acceptBtn: {
    backgroundColor: '#0f5132',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: {
    borderWidth: 1,
    borderColor: '#842029',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  declineBtnText: { color: '#842029', fontSize: 13, fontWeight: '700' },
  link: { fontSize: 14, color: '#0b57d0', fontWeight: '600' },
});
