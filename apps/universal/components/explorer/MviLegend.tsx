import { StyleSheet, Text, View } from 'react-native';

import { MVI_LEGEND_GRADIENT } from '@/lib/mviColors';

type Props = {
  style?: object;
};

export default function MviLegend({ style }: Props) {
  return (
    <View style={StyleSheet.flatten([styles.wrap, style])} pointerEvents="none">
      <Text style={styles.caption}>MARKET VIABILITY INDEX</Text>
      <View style={styles.barRow}>
        <Text style={styles.edge}>0</Text>
        <View
          style={StyleSheet.flatten([
            styles.bar,
            // RN Web accepts CSS backgroundImage on View
            { backgroundImage: MVI_LEGEND_GRADIENT } as object,
          ])}
        />
        <Text style={styles.edge}>100</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(12, 12, 20, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 220,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  caption: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  edge: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
    width: 22,
    textAlign: 'center',
  },
  bar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1a6b5a',
  },
});
