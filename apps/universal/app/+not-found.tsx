import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View style={styles.container}>
        <Text style={styles.route}>Route: +not-found</Text>
        <Text style={styles.title}>Screen not found</Text>
        <Link href="/" style={styles.link}>
          Go home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  link: {
    marginTop: 8,
    fontSize: 16,
    color: '#0b57d0',
  },
});
