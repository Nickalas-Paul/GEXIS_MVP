import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GeographyAgentsScreen() {
  const { geographyId } = useLocalSearchParams<{ geographyId: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.route}>Route: /explorer/[geographyId]/agents</Text>
        <Text style={styles.title}>Agents in {geographyId}</Text>
        <Text style={styles.copy}>Geography-scoped agent list (placeholder).</Text>
        <Link href={`/explorer/${geographyId}`} style={styles.link}>
          Back to geography
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
