import { StyleSheet, Text } from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';

export default function MethodologyScreen() {
  return (
    <MarketingShell>
      <Text style={styles.route}>Route: /docs/methodology</Text>
      <Text style={styles.title}>MVI Methodology</Text>
    </MarketingShell>
  );
}

const styles = StyleSheet.create({
  route: {
    fontSize: 14,
    opacity: 0.6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
});
