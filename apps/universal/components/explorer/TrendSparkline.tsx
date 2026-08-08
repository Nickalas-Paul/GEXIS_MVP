import { Platform, Text, View, StyleSheet } from 'react-native';

type Point = { year: number; score: number };

type Props = {
  data: Point[];
  color: string;
  width?: number;
  height?: number;
};

/** Native fallback — plain text summary (recharts is web-only). */
export default function TrendSparkline({ data }: Props) {
  if (!data.length) {
    return (
      <Text style={styles.fallback}>No historical series</Text>
    );
  }
  const first = data[0];
  const last = data[data.length - 1];
  return (
    <View style={styles.wrap}>
      <Text style={styles.fallback}>
        {first.year}–{last.year}: {first.score.toFixed(0)} → {last.score.toFixed(0)}
        {Platform.OS !== 'web' ? ' (sparkline on web)' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 48, justifyContent: 'center' },
  fallback: {
    color: '#8b8b9a',
    fontSize: 11,
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }),
  },
});
