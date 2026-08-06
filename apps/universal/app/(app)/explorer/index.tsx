import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Map from '@/components/Map';

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Map />
      <View
        style={[styles.overlay, { top: Math.max(insets.top, 16), left: 16 + insets.left }]}
        pointerEvents="box-none"
      >
        <Text style={styles.route}>Route: /explorer</Text>
        <Link href="/explorer/demo-geo" style={styles.link}>
          Open sample geography
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    maxWidth: 280,
  },
  route: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.8,
  },
  link: {
    fontSize: 14,
    color: '#9ec1ff',
  },
});
