import {
  INDUSTRY_VERTICAL_LABELS,
  RESPONSE_TIME_LABELS,
  getAgentCategoryLabel,
  type Agent,
  type AgentReview,
  type IndustryVerticalKey,
  type ResponseTime,
} from '@gexis/gexis-core';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTierAccess } from '@/hooks/useTierAccess';
import { getAgentById } from '@/services/agents';
import { ApiError } from '@/services/api';
import { useAuth } from '@/services/auth';
import { createEngagement } from '@/services/engagements';
import { listCountries } from '@/services/geographies';
import { getAgentReviews } from '@/services/reviews';
import {
  addToShortlist,
  getShortlist,
  removeFromShortlist,
} from '@/services/shortlist';

const DESKTOP_BREAKPOINT = 900;

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function engagementErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 || err.message === 'engagement_exists') {
      return 'You already have an active engagement with this agent';
    }
    if (err.message === 'cannot_engage_self') {
      return 'Cannot request introduction with yourself';
    }
    if (err.message === 'upgrade_required' || err.status === 403) {
      return 'Marketplace plan required';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Failed to send request';
}

export default function AgentProfileScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < DESKTOP_BREAKPOINT;
  const rawId = useLocalSearchParams<{ agentId: string | string[] }>().agentId;
  const agentId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { isAuthenticated } = useAuth();
  const { canAccessAgentIntros, gatingEnabled } = useTierAccess();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [reviews, setReviews] = useState<AgentReview[]>([]);
  const [coverageNames, setCoverageNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [shortlisted, setShortlisted] = useState(false);
  const [shortlistBusy, setShortlistBusy] = useState(false);

  const [introOpen, setIntroOpen] = useState(false);
  const [gateMessage, setGateMessage] = useState<'login' | 'upgrade' | null>(
    null
  );
  const [businessDescription, setBusinessDescription] = useState('');
  const [expansionGoals, setExpansionGoals] = useState('');
  const [timeline, setTimeline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      try {
        const [profile, reviewList] = await Promise.all([
          getAgentById(agentId),
          getAgentReviews(agentId),
        ]);
        if (cancelled) return;
        setAgent(profile);
        setReviews(reviewList);

        // TODO: Coverage mini-map — deferred to Step 10 polish
        if (profile.geographyIds?.length) {
          try {
            const countries = await listCountries();
            if (!cancelled) {
              const byId = new Map(countries.map((c) => [c.id, c.name]));
              setCoverageNames(
                profile.geographyIds
                  .map((id) => byId.get(id))
                  .filter((n): n is string => Boolean(n))
              );
            }
          } catch {
            if (!cancelled) setCoverageNames([]);
          }
        } else {
          setCoverageNames([]);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load profile'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!isAuthenticated || !agentId) {
      setShortlisted(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const items = await getShortlist();
        if (!cancelled) {
          setShortlisted(items.some((i) => i.agentId === agentId));
        }
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, agentId]);

  const onRequestIntroPress = () => {
    setSuccessMessage(null);
    setSubmitError(null);
    if (!isAuthenticated) {
      setGateMessage('login');
      return;
    }
    if (!canAccessAgentIntros()) {
      setGateMessage('upgrade');
      return;
    }
    setGateMessage(null);
    setIntroOpen(true);
  };

  const onSubmitIntro = async () => {
    if (!agentId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: {
        agentId: string;
        businessDescription?: string;
        expansionGoals?: string;
        timeline?: string;
      } = { agentId };
      if (businessDescription.trim()) {
        payload.businessDescription = businessDescription.trim();
      }
      if (expansionGoals.trim()) {
        payload.expansionGoals = expansionGoals.trim();
      }
      if (timeline.trim()) payload.timeline = timeline.trim();

      await createEngagement(payload);
      setIntroOpen(false);
      setBusinessDescription('');
      setExpansionGoals('');
      setTimeline('');
      setSuccessMessage(
        'Introduction requested — the agent will respond shortly'
      );
    } catch (err) {
      setSubmitError(engagementErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShortlist = async () => {
    if (!agentId) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (shortlistBusy) return;
    const was = shortlisted;
    setShortlisted(!was);
    setShortlistBusy(true);
    try {
      if (was) await removeFromShortlist(agentId);
      else await addToShortlist(agentId);
    } catch {
      setShortlisted(was);
    } finally {
      setShortlistBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.muted}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Agent not found</Text>
          <Text style={styles.copy}>
            This agent profile does not exist or was removed.
          </Text>
          <Link href="/marketplace" style={styles.link}>
            Back to Marketplace
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !agent) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.error}>{loadError ?? 'Failed to load'}</Text>
          <Link href="/marketplace" style={styles.link}>
            Back to Marketplace
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  const categoryLabel = getAgentCategoryLabel(
    agent.category,
    agent.customCategory
  );
  const responseLabel = agent.responseTime
    ? RESPONSE_TIME_LABELS[agent.responseTime as ResponseTime] ??
      agent.responseTime
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isNarrow && styles.scrollNarrow,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
          <View style={styles.mainCol}>
            <Text style={styles.eyebrow}>Agent profile</Text>
            <Text style={styles.title}>{agent.name}</Text>
            {agent.company ? (
              <Text style={styles.company}>{agent.company}</Text>
            ) : null}

            <View style={styles.metaRow}>
              {agent.verified ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>Pending Verification</Text>
                </View>
              )}
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{categoryLabel}</Text>
              </View>
            </View>

            <Text style={styles.ratingLine}>
              ★ {Number(agent.rating).toFixed(2)}
              <Text style={styles.engagements}>
                {' '}
                ({agent.engagementCount}{' '}
                {agent.engagementCount === 1 ? 'engagement' : 'engagements'})
              </Text>
            </Text>

            {responseLabel ? (
              <Text style={styles.responseTime}>⏱ {responseLabel}</Text>
            ) : null}

            {agent.bio ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bio}>{agent.bio}</Text>
              </View>
            ) : null}

            {agent.website ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Website</Text>
                <Pressable
                  onPress={() => void Linking.openURL(agent.website!)}
                >
                  <Text style={styles.link}>{agent.website}</Text>
                </Pressable>
              </View>
            ) : null}

            {(agent.industryVerticals?.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Industry verticals</Text>
                <View style={styles.chipRow}>
                  {agent.industryVerticals.map((key) => (
                    <View key={key} style={styles.verticalChip}>
                      <Text style={styles.verticalChipText}>
                        {INDUSTRY_VERTICAL_LABELS[
                          key as IndustryVerticalKey
                        ] ?? key}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {(agent.domainTags?.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Domain tags</Text>
                <View style={styles.chipRow}>
                  {agent.domainTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Coverage areas</Text>
              {/* TODO: Coverage mini-map — deferred to Step 10 polish */}
              {coverageNames.length > 0 ? (
                <View style={styles.chipRow}>
                  {coverageNames.map((name) => (
                    <View key={name} style={styles.geoChip}>
                      <Text style={styles.geoChipText}>{name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>No coverage areas listed.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Reviews ({reviews.length})
              </Text>
              {reviews.length === 0 ? (
                <Text style={styles.muted}>No reviews yet.</Text>
              ) : (
                reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <Text style={styles.reviewRating}>
                      ★ {Number(review.rating).toFixed(1)}
                    </Text>
                    {review.engagementType ? (
                      <Text style={styles.reviewType}>
                        {review.engagementType}
                      </Text>
                    ) : null}
                    {review.reviewText ? (
                      <Text style={styles.reviewText}>{review.reviewText}</Text>
                    ) : null}
                    <Text style={styles.reviewDate}>
                      {formatReviewDate(review.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={[styles.sideCol, isNarrow && styles.sideColNarrow]}>
            {successMessage ? (
              <View style={styles.successBox} testID="intro-success">
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            {gateMessage === 'login' ? (
              <View style={styles.gateBox} testID="intro-login-prompt">
                <Text style={styles.gateText}>
                  Log in to request an introduction.
                </Text>
                <Link href="/login" style={styles.link}>
                  Go to login
                </Link>
              </View>
            ) : null}

            {gateMessage === 'upgrade' ? (
              <View style={styles.gateBox} testID="intro-upgrade-prompt">
                <Text style={styles.gateText}>Marketplace plan required</Text>
                <Text style={styles.muted}>
                  Agent introductions are available on the Marketplace plan
                  {gatingEnabled ? '' : ''}.
                </Text>
                <Link href="/pricing" style={styles.link}>
                  View pricing
                </Link>
              </View>
            ) : null}

            <Pressable
              testID="request-intro-btn"
              style={styles.primaryBtn}
              onPress={onRequestIntroPress}
            >
              <Text style={styles.primaryBtnText}>Request Introduction</Text>
            </Pressable>

            <Pressable
              testID={`profile-shortlist-${agent.id}`}
              style={styles.secondaryBtn}
              onPress={() => void toggleShortlist()}
              accessibilityLabel={
                shortlisted ? 'Remove from shortlist' : 'Add to shortlist'
              }
            >
              <Text style={styles.secondaryBtnText}>
                {shortlisted ? '♥ Remove from Shortlist' : '♡ Add to Shortlist'}
              </Text>
            </Pressable>

            <Link href="/marketplace" asChild>
              <Pressable style={styles.backBtn}>
                <Text style={styles.backBtnText}>Back to Marketplace</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={introOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIntroOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="intro-form-modal">
            <Text style={styles.modalTitle}>Request Introduction</Text>
            <Text style={styles.modalSubtitle}>
              Tell {agent.name} about your project.
            </Text>

            <Text style={styles.fieldLabel}>Business description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={businessDescription}
              onChangeText={setBusinessDescription}
              placeholder="Describe your business and what you're looking for..."
              placeholderTextColor="#9a9a96"
              multiline
              editable={!submitting}
            />

            <Text style={styles.fieldLabel}>Expansion goals</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={expansionGoals}
              onChangeText={setExpansionGoals}
              placeholder="What are your expansion goals?"
              placeholderTextColor="#9a9a96"
              multiline
              editable={!submitting}
            />

            <Text style={styles.fieldLabel}>Timeline</Text>
            <TextInput
              style={styles.input}
              value={timeline}
              onChangeText={setTimeline}
              placeholder="e.g., Q1 2027"
              placeholderTextColor="#9a9a96"
              editable={!submitting}
            />

            {submitError ? (
              <Text style={styles.error} testID="intro-error">
                {submitError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setIntroOpen(false)}
                disabled={submitting}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="send-request-btn"
                style={[
                  styles.primaryBtn,
                  submitting && styles.primaryBtnDisabled,
                ]}
                onPress={() => void onSubmitIntro()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send Request</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  scrollNarrow: {
    paddingHorizontal: 16,
  },
  layout: {
    flexDirection: 'row',
    gap: 28,
    alignItems: 'flex-start',
  },
  layoutNarrow: {
    flexDirection: 'column',
  },
  mainCol: {
    flex: 1,
    gap: 14,
    minWidth: 0,
  },
  sideCol: {
    width: 280,
    gap: 12,
  },
  sideColNarrow: {
    width: '100%',
  },
  centered: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6b6b6b',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  company: {
    fontSize: 16,
    color: '#6b6b6b',
    marginTop: -6,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4a4a4a',
  },
  muted: {
    color: '#6b6b6b',
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  verifiedBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
  },
  pendingBadge: {
    backgroundColor: '#f5f5f0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b6b',
  },
  categoryChip: {
    backgroundColor: '#f0f0ec',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3a3a',
  },
  ratingLine: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  engagements: {
    fontWeight: '400',
    color: '#6b6b6b',
  },
  responseTime: {
    fontSize: 14,
    color: '#4a4a4a',
  },
  section: {
    gap: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  bio: {
    fontSize: 15,
    lineHeight: 24,
    color: '#3a3a3a',
  },
  link: {
    fontSize: 15,
    color: '#0b57d0',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: '#eef3fb',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a3a6e',
  },
  verticalChip: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verticalChipText: {
    fontSize: 12,
    color: '#4a4a4a',
  },
  geoChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  geoChipText: {
    fontSize: 12,
    color: '#3a3a3a',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  reviewRating: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  reviewType: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '600',
    color: '#4a4a4a',
    backgroundColor: '#f0f0ec',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#3a3a3a',
  },
  reviewDate: {
    fontSize: 12,
    color: '#6b6b6b',
  },
  primaryBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
  backBtn: {
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 14,
    color: '#0b57d0',
    fontWeight: '600',
  },
  successBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 12,
  },
  successText: {
    color: '#1b5e20',
    fontSize: 13,
    fontWeight: '600',
  },
  gateBox: {
    backgroundColor: '#fff8e6',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  gateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  error: {
    color: '#b42318',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b6b6b',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a4a4a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#f7f7f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
});
