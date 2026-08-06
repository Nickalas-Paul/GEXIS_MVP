import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AgentProfileScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.route}>Route: /marketplace/[agentId]</Text>
        <Text style={styles.title}>Agent profile</Text>
        <Text style={styles.copy}>agentId: {agentId}</Text>
        <Link href="/marketplace" style={styles.link}>
          Back to marketplace
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
});
