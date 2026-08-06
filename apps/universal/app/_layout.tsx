import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AuthProvider } from '@/services/auth';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="pricing" />
          <Stack.Screen name="docs/methodology" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
