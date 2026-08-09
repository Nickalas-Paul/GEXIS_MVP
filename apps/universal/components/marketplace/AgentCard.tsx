import {
  INDUSTRY_VERTICAL_LABELS,
  RESPONSE_TIME_LABELS,
  getAgentCategoryLabel,
  type AgentCard as AgentCardType,
  type IndustryVerticalKey,
  type ResponseTime,
} from '@gexis/gexis-core';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  agent: AgentCardType;
  narrow?: boolean;
  shortlisted: boolean;
  onToggleShortlist: () => void;
};

export default function AgentCard({
  agent,
  narrow = false,
  shortlisted,
  onToggleShortlist,
}: Props) {
  const categoryLabel = getAgentCategoryLabel(
    agent.category,
    agent.customCategory
  );
  const responseLabel = agent.responseTime
    ? RESPONSE_TIME_LABELS[agent.responseTime as ResponseTime] ??
      agent.responseTime
    : null;

  const tags = agent.domainTags ?? [];
  const verticals = agent.industryVerticals ?? [];
  const visibleTags = tags.slice(0, 5);
  const extraTags = Math.max(0, tags.length - 5);
  const visibleVerticals = verticals.slice(0, 3);
  const extraVerticals = Math.max(0, verticals.length - 3);

  return (
    <View style={[styles.card, narrow ? styles.cardFull : styles.cardHalf]}>
      <View style={styles.cardTop}>
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName}>{agent.name}</Text>
          {agent.company ? (
            <Text style={styles.cardCompany}>{agent.company}</Text>
          ) : null}
        </View>
        <Pressable
          testID={`shortlist-${agent.id}`}
          onPress={onToggleShortlist}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            shortlisted ? 'Remove from shortlist' : 'Add to shortlist'
          }
          accessibilityState={{ selected: shortlisted }}
          style={styles.heartBtn}
        >
          <Text style={[styles.heart, shortlisted && styles.heartFilled]}>
            {shortlisted ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.cardMetaRow}>
        {agent.verified ? (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified</Text>
          </View>
        ) : (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Pending</Text>
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
        <Text style={styles.responseTime}>{responseLabel}</Text>
      ) : null}

      {visibleTags.length > 0 ? (
        <View style={styles.chipRow}>
          {visibleTags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
            </View>
          ))}
          {extraTags > 0 ? (
            <Text style={styles.moreText}>+{extraTags} more</Text>
          ) : null}
        </View>
      ) : null}

      {visibleVerticals.length > 0 ? (
        <View style={styles.chipRow}>
          {visibleVerticals.map((key) => (
            <View key={key} style={styles.verticalChip}>
              <Text style={styles.verticalChipText}>
                {INDUSTRY_VERTICAL_LABELS[key as IndustryVerticalKey] ?? key}
              </Text>
            </View>
          ))}
          {extraVerticals > 0 ? (
            <Text style={styles.moreText}>+{extraVerticals} more</Text>
          ) : null}
        </View>
      ) : null}

      <Link href={`/marketplace/${agent.id}`} asChild>
        <Pressable style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>View Profile</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  cardFull: {
    width: '100%',
  },
  cardHalf: {
    width: '48%',
    flexGrow: 1,
    minWidth: 280,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cardCompany: {
    fontSize: 14,
    color: '#6b6b6b',
  },
  heartBtn: {
    padding: 4,
  },
  heart: {
    fontSize: 22,
    color: '#9a9a96',
  },
  heartFilled: {
    color: '#c62828',
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  verifiedBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b5e20',
  },
  pendingBadge: {
    backgroundColor: '#f5f5f0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b6b6b',
  },
  categoryChip: {
    backgroundColor: '#f0f0ec',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3a3a3a',
  },
  ratingLine: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  engagements: {
    fontWeight: '400',
    color: '#6b6b6b',
  },
  responseTime: {
    fontSize: 13,
    color: '#4a4a4a',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tagChip: {
    backgroundColor: '#eef3fb',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a3a6e',
  },
  verticalChip: {
    borderWidth: 1,
    borderColor: '#e2e2de',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verticalChipText: {
    fontSize: 11,
    color: '#4a4a4a',
  },
  moreText: {
    fontSize: 11,
    color: '#6b6b6b',
  },
  viewBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
