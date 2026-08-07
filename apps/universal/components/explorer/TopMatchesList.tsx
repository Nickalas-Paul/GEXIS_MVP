import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mviScoreColor } from '@/lib/mviColors';
import type { GeographyListItem } from '@/services/geographies';

type Props = {
  items: GeographyListItem[];
  selectedIsoCode?: string | null;
  onSelect: (item: GeographyListItem) => void;
  style?: object;
};

export default function TopMatchesList({
  items,
  selectedIsoCode,
  onSelect,
  style,
}: Props) {
  const scored = items.filter((g) => g.mvi?.overall != null);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>TOP MATCHES</Text>
        <Text style={styles.count}>{scored.length} results</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {scored.map((item) => {
          const score = item.mvi?.overall ?? null;
          const color = mviScoreColor(score);
          const selected = item.isoCode === selectedIsoCode;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text
                style={[styles.name, selected && styles.nameSelected]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text style={[styles.score, { color }]}>
                {score != null ? Math.round(score) : '—'}
              </Text>
            </Pressable>
          );
        })}
        {scored.length === 0 ? (
          <Text style={styles.empty}>No matching geographies</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 160,
    borderTopWidth: 1,
    borderTopColor: '#1c1c2a',
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  count: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  rowSelected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
  },
  nameSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  score: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
  empty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    padding: 12,
    textAlign: 'center',
  },
});
