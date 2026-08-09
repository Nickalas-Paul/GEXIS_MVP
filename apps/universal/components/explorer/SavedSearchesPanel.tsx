import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useTierAccess } from '@/hooks/useTierAccess';
import {
  DEFAULT_FILTERS,
  stateToSavedFilters,
  type ExplorerFilterState,
} from '@/lib/explorerFilters';

type Props = {
  filters: ExplorerFilterState;
  onChange: (patch: Partial<ExplorerFilterState>) => void;
};

export default function SavedSearchesPanel({ filters, onChange }: Props) {
  const { canSaveSearches, canUseFilter, canUseHorizon, canUseIndustryVertical } =
    useTierAccess();
  const allowed = canSaveSearches();
  const {
    savedSearches,
    loading,
    error,
    saveCurrentFilters,
    applySavedSearch,
    deleteSavedSearch,
  } = useSavedSearches({ enabled: allowed });

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 100 && !saving;

  const onSave = async () => {
    if (!canSubmit || !allowed) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCurrentFilters(trimmed, stateToSavedFilters(filters) as Record<string, unknown>);
      setName('');
      setFormOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onApply = (id: string) => {
    const search = savedSearches.find((s) => s.id === id);
    if (!search) return;
    const next = applySavedSearch(search);

    // When gating is on, ignore dimensions the user cannot use.
    if (!canUseFilter('talentDensity')) {
      next.minTalentDensity = DEFAULT_FILTERS.minTalentDensity;
    }
    if (!canUseFilter('competitorSaturation')) {
      next.maxCompetitorSaturation = DEFAULT_FILTERS.maxCompetitorSaturation;
    }
    if (!canUseIndustryVertical()) {
      next.industryVertical = DEFAULT_FILTERS.industryVertical;
    }
    if (!canUseHorizon(next.horizon)) {
      next.horizon = DEFAULT_FILTERS.horizon;
    }

    onChange(next);
  };

  const onDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setBusyId(id);
    try {
      await deleteSavedSearch(id);
      setConfirmDeleteId(null);
    } catch {
      // keep list; refresh already handled on success
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SAVED SEARCHES</Text>
        {allowed ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              setFormOpen((v) => !v);
              setSaveError(null);
            }}
          >
            <Text style={styles.saveBtn}>{formOpen ? 'Cancel' : '+ Save'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.saveBtnLocked}>+ Save</Text>
        )}
      </View>

      {!allowed ? (
        <Text style={styles.proLabel}>Pro feature</Text>
      ) : null}

      {allowed && formOpen ? (
        <View style={styles.form}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Search name"
            placeholderTextColor="rgba(255,255,255,0.35)"
            maxLength={100}
            style={styles.input}
            autoFocus
          />
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          <View style={styles.formActions}>
            <Pressable
              style={[styles.formBtn, !canSubmit && styles.formBtnDisabled]}
              disabled={!canSubmit}
              onPress={() => void onSave()}
            >
              <Text style={styles.formBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
            <Pressable
              style={styles.formBtnGhost}
              onPress={() => {
                setFormOpen(false);
                setName('');
                setSaveError(null);
              }}
            >
              <Text style={styles.formBtnGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!allowed ? (
        <Text style={styles.lockedMsg}>Upgrade to Pro to save searches</Text>
      ) : loading ? (
        <ActivityIndicator color="#7aa2ff" style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : savedSearches.length === 0 ? (
        <Text style={styles.empty}>No saved searches yet</Text>
      ) : (
        <View style={styles.list}>
          {savedSearches.map((search) => {
            const confirming = confirmDeleteId === search.id;
            return (
              <View key={search.id} style={styles.item}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {search.name}
                </Text>
                <View style={styles.itemActions}>
                  <Pressable
                    hitSlop={6}
                    onPress={() => onApply(search.id)}
                    style={styles.itemBtn}
                  >
                    <Text style={styles.itemBtnText}>Apply</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    disabled={busyId === search.id}
                    onPress={() => void onDelete(search.id)}
                    style={styles.itemBtn}
                  >
                    <Text
                      style={[
                        styles.itemBtnText,
                        confirming && styles.itemBtnDanger,
                      ]}
                    >
                      {busyId === search.id
                        ? '...'
                        : confirming
                          ? 'Delete?'
                          : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1c1c2a',
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  saveBtn: {
    color: '#7aa2ff',
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtnLocked: {
    color: '#7aa2ff',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.35,
  },
  proLabel: {
    color: '#e0a03a',
    fontSize: 11,
    fontWeight: '600',
  },
  form: {
    gap: 8,
  },
  input: {
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 13,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  formBtn: {
    backgroundColor: '#1a3a6e',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  formBtnDisabled: {
    opacity: 0.4,
  },
  formBtnText: {
    color: '#c8dcff',
    fontSize: 12,
    fontWeight: '600',
  },
  formBtnGhost: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  formBtnGhostText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 8,
  },
  empty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  lockedMsg: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  errorText: {
    color: '#d96b6b',
    fontSize: 11,
  },
  list: {
    gap: 8,
  },
  item: {
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: '#1c1c2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  itemName: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 12,
  },
  itemBtn: {
    paddingVertical: 2,
  },
  itemBtnText: {
    color: '#7aa2ff',
    fontSize: 12,
    fontWeight: '600',
  },
  itemBtnDanger: {
    color: '#e0a03a',
  },
});