import { StyleSheet, Text, View } from 'react-native';

import type { MapProps } from './Map.types';

export default function Map({ style }: MapProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>Map: native pending</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
  },
});
