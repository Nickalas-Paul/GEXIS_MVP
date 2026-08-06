import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GeographyDetailScreen() {
  const { geographyId } = useLocalSearchParams<{ geographyId: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.route}>Route: /explorer/[geographyId]</Text>
        <Text style={styles.title}>Geography detail</Text>
        <Text style={styles.copy}>geographyId: {geographyId}</Text>
        <Link href={`/explorer/${geographyId}/agents`} style={styles.link}>
          View agents
        </Link>
        <Link href="/explorer" style={styles.link}>
          Back to explorer
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
