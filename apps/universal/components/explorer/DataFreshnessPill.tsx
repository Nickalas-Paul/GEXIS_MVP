import { StyleSheet, Text, View } from 'react-native';

type Props = {
  dateLabel: string;
  /** When set, replaces the default "Data:" prefix (e.g. projected horizons). */
  labelPrefix?: string;
  style?: object;
};

export default function DataFreshnessPill({
  dateLabel,
  labelPrefix = 'Data',
  style,
}: Props) {
  return (
    <View style={StyleSheet.flatten([styles.pill, style])} pointerEvents="none">
      <Text style={styles.dot}>●</Text>
      <Text style={styles.text}>
        {labelPrefix}: {dateLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12, 12, 20, 0.85)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dot: {
    color: '#3ecf8e',
    fontSize: 10,
  },
  text: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
});
