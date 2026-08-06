import { StyleSheet, Text } from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';

export default function PricingScreen() {
  return (
    <MarketingShell>
      <Text style={styles.route}>Route: /pricing</Text>
      <Text style={styles.title}>Pricing</Text>
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
