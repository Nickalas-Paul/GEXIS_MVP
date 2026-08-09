import {
  AGENT_CATEGORY_KEYS,
  AGENT_CATEGORY_LABELS,
  AGENT_SELECTABLE_VERTICALS,
  INDUSTRY_VERTICAL_LABELS,
  RESPONSE_TIME_KEYS,
  RESPONSE_TIME_LABELS,
  getAgentCategoryLabel,
  type Agent,
  type AgentCategory,
  type IndustryVerticalKey,
  type ResponseTime,
} from '@gexis/gexis-core';
import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import {
  createAgentProfile,
  getMyAgentProfile,
  type CreateAgentInput,
} from '@/services/agents';
import { ApiError } from '@/services/api';
import { listCountries } from '@/services/geographies';

const TOTAL_STEPS = 4;

type CountryOption = { id: string; name: string; isoCode: string | null };

type FormState = {
  name: string;
  company: string;
  bio: string;
  website: string;
  responseTime: ResponseTime | '';
  category: AgentCategory | '';
  customCategory: string;
  industryVerticals: string[];
  domainTags: string[];
  geographyIds: string[];
};

const INITIAL_FORM: FormState = {
  name: '',
  company: '',
  bio: '',
  website: '',
  responseTime: '',
  category: '',
  customCategory: '',
  industryVerticals: [],
  domainTags: [],
  geographyIds: [],
};

export default function AgentOnboardScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 720;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [tagDraft, setTagDraft] = useState('');
  const [geoSearch, setGeoSearch] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countriesError, setCountriesError] = useState<string | null>(null);

  const [profileLoading, setProfileLoading] = useState(true);
  const [existingProfile, setExistingProfile] = useState<Agent | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const profile = await getMyAgentProfile();
        if (!cancelled) setExistingProfile(profile);
      } catch (err) {
        if (!cancelled) {
          setProfileError(
            err instanceof Error ? err.message : 'Failed to load profile'
          );
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 3 || countries.length > 0) return;
    let cancelled = false;
    (async () => {
      setCountriesLoading(true);
      setCountriesError(null);
      try {
        const list = await listCountries();
        if (!cancelled) {
          setCountries(
            [...list].sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setCountriesError(
            err instanceof Error ? err.message : 'Failed to load countries'
          );
        }
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, countries.length]);

  const filteredCountries = useMemo(() => {
    const q = geoSearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.isoCode ?? '').toLowerCase().includes(q)
    );
  }, [countries, geoSearch]);

  const countryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of countries) map.set(c.id, c.name);
    return map;
  }, [countries]);

  const canNextStep1 = form.name.trim().length > 0;
  const canNextStep2 =
    form.category !== '' &&
    (form.category !== 'other' || form.customCategory.trim().length > 0);

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const toggleVertical = (key: string) => {
    setForm((prev) => {
      const has = prev.industryVerticals.includes(key);
      return {
        ...prev,
        industryVerticals: has
          ? prev.industryVerticals.filter((v) => v !== key)
          : [...prev.industryVerticals, key],
      };
    });
  };

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) return;
    setForm((prev) => {
      if (prev.domainTags.includes(tag)) return prev;
      return { ...prev, domainTags: [...prev.domainTags, tag] };
    });
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      domainTags: prev.domainTags.filter((t) => t !== tag),
    }));
  };

  const toggleCountry = (id: string) => {
    setForm((prev) => {
      const has = prev.geographyIds.includes(id);
      return {
        ...prev,
        geographyIds: has
          ? prev.geographyIds.filter((g) => g !== id)
          : [...prev.geographyIds, id],
      };
    });
  };

  const onSubmit = async () => {
    if (!form.category || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreateAgentInput = {
        name: form.name.trim(),
        category: form.category,
        industryVerticals: form.industryVerticals,
        domainTags: form.domainTags,
        geographyIds: form.geographyIds,
      };
      if (form.company.trim()) payload.company = form.company.trim();
      if (form.bio.trim()) payload.bio = form.bio.trim();
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.responseTime) payload.responseTime = form.responseTime;
      if (form.category === 'other') {
        payload.customCategory = form.customCategory.trim();
      }

      const created = await createAgentProfile(payload);
      setCreatedId(created.id);
      router.replace(`/marketplace/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setSubmitError('Profile already exists');
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to create profile'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.muted}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (profileError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.error}>{profileError}</Text>
          <Link href="/marketplace" style={styles.link}>
            Back to marketplace
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  if (existingProfile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.container, isNarrow && styles.containerNarrow]}>
          <Text style={styles.title}>You already have an agent profile</Text>
          <Text style={styles.copy}>
            Each account can have one agent profile. Your profile is{' '}
            {existingProfile.verified ? 'verified' : 'pending verification'}.
          </Text>
          <Link href={`/marketplace/${existingProfile.id}`} asChild>
            <Pressable style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>View your profile</Text>
            </Pressable>
          </Link>
          <Link href="/marketplace" style={styles.link}>
            Back to marketplace
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  if (createdId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Profile created</Text>
          <Text style={styles.copy}>
            Your profile is pending verification.
          </Text>
          <Link href={`/marketplace/${createdId}`} style={styles.link}>
            Open profile
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isNarrow && styles.containerNarrow,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>Agent onboarding</Text>
        <Text style={styles.title}>Become an Agent</Text>
        <Text style={styles.stepLabel}>
          Step {step} of {TOTAL_STEPS}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, i + 1 <= step && styles.dotActive]}
            />
          ))}
        </View>

        {step === 1 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic info</Text>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(name) => patch({ name })}
              placeholder="Your full name or business name"
              placeholderTextColor="#9a9a96"
              editable={!submitting}
            />
            <Text style={styles.fieldLabel}>Company</Text>
            <TextInput
              style={styles.input}
              value={form.company}
              onChangeText={(company) => patch({ company })}
              placeholder="Company name"
              placeholderTextColor="#9a9a96"
              editable={!submitting}
            />
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.bio}
              onChangeText={(bio) => patch({ bio })}
              placeholder="Describe your expertise and services..."
              placeholderTextColor="#9a9a96"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!submitting}
            />
            <Text style={styles.fieldLabel}>Website</Text>
            <TextInput
              style={styles.input}
              value={form.website}
              onChangeText={(website) => patch({ website })}
              placeholder="https://..."
              placeholderTextColor="#9a9a96"
              autoCapitalize="none"
              editable={!submitting}
            />
            <Text style={styles.fieldLabel}>Typical response time</Text>
            <View style={styles.chipRow}>
              {RESPONSE_TIME_KEYS.map((key) => {
                const active = form.responseTime === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() =>
                      patch({ responseTime: active ? '' : key })
                    }
                    style={[styles.chip, active && styles.chipActive]}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {RESPONSE_TIME_LABELS[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category & expertise</Text>
            <Text style={styles.fieldLabel}>Primary category *</Text>
            <View style={styles.categoryGrid}>
              {AGENT_CATEGORY_KEYS.map((key) => {
                const active = form.category === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() =>
                      patch({
                        category: key,
                        customCategory:
                          key === 'other' ? form.customCategory : '',
                      })
                    }
                    style={[
                      styles.categoryCard,
                      active && styles.categoryCardActive,
                    ]}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.categoryCardText,
                        active && styles.categoryCardTextActive,
                      ]}
                    >
                      {AGENT_CATEGORY_LABELS[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {form.category === 'other' ? (
              <>
                <Text style={styles.fieldLabel}>Custom category *</Text>
                <TextInput
                  style={styles.input}
                  value={form.customCategory}
                  onChangeText={(customCategory) =>
                    patch({ customCategory })
                  }
                  placeholder="Specify your category, e.g. Government Relations"
                  placeholderTextColor="#9a9a96"
                  editable={!submitting}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Industry verticals</Text>
            <View style={styles.chipRow}>
              {AGENT_SELECTABLE_VERTICALS.map((key) => {
                const active = form.industryVerticals.includes(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleVertical(key)}
                    style={[styles.chip, active && styles.chipActive]}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {
                        INDUSTRY_VERTICAL_LABELS[
                          key as Exclude<IndustryVerticalKey, 'all'>
                        ]
                      }
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Domain tags</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, styles.tagInput]}
                value={tagDraft}
                onChangeText={setTagDraft}
                placeholder="Add tags like 'cold-chain', 'import-tariffs'..."
                placeholderTextColor="#9a9a96"
                autoCapitalize="none"
                onSubmitEditing={addTag}
                returnKeyType="done"
                blurOnSubmit={false}
                editable={!submitting}
              />
              <Pressable
                style={styles.secondaryBtn}
                onPress={addTag}
                disabled={submitting}
              >
                <Text style={styles.secondaryBtnText}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.chipRow}>
              {form.domainTags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => removeTag(tag)}
                  style={styles.tagChip}
                  disabled={submitting}
                >
                  <Text style={styles.tagChipText}>{tag} ×</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coverage areas</Text>
            <Text style={styles.copy}>
              {form.geographyIds.length}{' '}
              {form.geographyIds.length === 1 ? 'country' : 'countries'}{' '}
              selected
            </Text>
            <TextInput
              style={styles.input}
              value={geoSearch}
              onChangeText={setGeoSearch}
              placeholder="Search countries..."
              placeholderTextColor="#9a9a96"
              editable={!submitting}
            />
            {countriesLoading ? (
              <ActivityIndicator color="#1a1a1a" style={{ marginTop: 12 }} />
            ) : null}
            {countriesError ? (
              <Text style={styles.error}>{countriesError}</Text>
            ) : null}
            <View style={styles.countryList}>
              {filteredCountries.map((c) => {
                const active = form.geographyIds.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleCountry(c.id)}
                    style={[
                      styles.countryRow,
                      active && styles.countryRowActive,
                    ]}
                    disabled={submitting}
                  >
                    <Text style={styles.checkbox}>{active ? '☑' : '☐'}</Text>
                    <Text style={styles.countryName}>{c.name}</Text>
                    {c.isoCode ? (
                      <Text style={styles.countryIso}>{c.isoCode}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Review & submit</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Name" value={form.name.trim()} />
              <SummaryRow
                label="Company"
                value={form.company.trim() || '—'}
              />
              <SummaryRow label="Bio" value={form.bio.trim() || '—'} />
              <SummaryRow
                label="Website"
                value={form.website.trim() || '—'}
              />
              <SummaryRow
                label="Response time"
                value={
                  form.responseTime
                    ? RESPONSE_TIME_LABELS[form.responseTime]
                    : '—'
                }
              />
              <SummaryRow
                label="Category"
                value={
                  form.category
                    ? getAgentCategoryLabel(
                        form.category,
                        form.customCategory.trim() || null
                      )
                    : '—'
                }
              />
              <SummaryRow
                label="Verticals"
                value={
                  form.industryVerticals.length
                    ? form.industryVerticals
                        .map(
                          (k) =>
                            INDUSTRY_VERTICAL_LABELS[
                              k as IndustryVerticalKey
                            ] ?? k
                        )
                        .join(', ')
                    : '—'
                }
              />
              <Text style={styles.summaryLabel}>Domain tags</Text>
              <View style={styles.chipRow}>
                {form.domainTags.length ? (
                  form.domainTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.summaryValue}>—</Text>
                )}
              </View>
              <SummaryRow
                label="Countries"
                value={
                  form.geographyIds.length
                    ? form.geographyIds
                        .map((id) => countryNameById.get(id) ?? id)
                        .join(', ')
                    : '—'
                }
              />
            </View>
            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
            <Text style={styles.pendingNote}>
              After creation, your profile will show as pending verification.
            </Text>
          </View>
        ) : null}

        <View style={styles.navRow}>
          {step > 1 ? (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>
          ) : (
            <Link href="/marketplace" asChild>
              <Pressable style={styles.secondaryBtn} disabled={submitting}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </Link>
          )}

          {step < TOTAL_STEPS ? (
            <Pressable
              style={[
                styles.primaryBtn,
                ((step === 1 && !canNextStep1) ||
                  (step === 2 && !canNextStep2)) &&
                  styles.primaryBtnDisabled,
              ]}
              disabled={
                submitting ||
                (step === 1 && !canNextStep1) ||
                (step === 2 && !canNextStep2)
              }
              onPress={() => setStep((s) => s + 1)}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.primaryBtn,
                submitting && styles.primaryBtnDisabled,
              ]}
              disabled={submitting}
              onPress={() => void onSubmit()}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create Profile</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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
    gap: 16,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  containerNarrow: {
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6b6b6b',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  stepLabel: {
    fontSize: 14,
    color: '#6b6b6b',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#3a3a3a',
  },
  muted: {
    marginTop: 8,
    color: '#6b6b6b',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d8d8d4',
  },
  dotActive: {
    backgroundColor: '#1a1a1a',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a4a4a',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  textArea: {
    minHeight: 100,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  chipText: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  categoryGrid: {
    gap: 8,
  },
  categoryCard: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  categoryCardActive: {
    borderColor: '#1a1a1a',
    backgroundColor: '#1a1a1a',
  },
  categoryCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  categoryCardTextActive: {
    color: '#ffffff',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tagInput: {
    flex: 1,
  },
  tagChip: {
    backgroundColor: '#e8eef9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipText: {
    color: '#0b57d0',
    fontSize: 13,
    fontWeight: '600',
  },
  countryList: {
    maxHeight: 360,
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0ec',
  },
  countryRowActive: {
    backgroundColor: '#f3f6fb',
  },
  checkbox: {
    fontSize: 16,
    width: 22,
    color: '#1a1a1a',
  },
  countryName: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
  },
  countryIso: {
    fontSize: 12,
    color: '#6b6b6b',
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  summaryBlock: {
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b6b6b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  pendingNote: {
    fontSize: 14,
    color: '#6b6b6b',
    lineHeight: 20,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
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
    fontSize: 15,
    fontWeight: '600',
  },
  link: {
    marginTop: 8,
    fontSize: 16,
    color: '#0b57d0',
  },
  error: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
});
