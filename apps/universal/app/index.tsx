import { StyleSheet, Text } from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';

export default function LandingScreen() {
  return (
    <MarketingShell>
      <Text style={styles.route}>Route: /</Text>
      <Text style={styles.headline}>See where to expand.</Text>
      <Text style={styles.subcopy}>
        GEXIS geospatial market intelligence - landing placeholder.
      </Text>
    </MarketingShell>
  );
}

const styles = StyleSheet.create({
  route: {
    fontSize: 14,
    opacity: 0.6,
  },
  headline: {
    fontSize: 36,
    fontWeight: '700',
  },
  subcopy: {
    fontSize: 16,
    maxWidth: 480,
    lineHeight: 24,
  },
});
