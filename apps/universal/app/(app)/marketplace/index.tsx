import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MarketplaceScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.route}>Route: /marketplace</Text>
        <Text style={styles.title}>Marketplace</Text>
        <Text style={styles.copy}>Agent directory (placeholder).</Text>
        <Link href="/marketplace/demo-agent" style={styles.link}>
          Open sample agent
        </Link>
        <Link href="/marketplace/onboard" asChild>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>Become an Agent</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  route: {
    fontSize: 14,
    opacity: 0.6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
  },
  link: {
    marginTop: 8,
    fontSize: 16,
    color: '#0b57d0',
  },
  cta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
