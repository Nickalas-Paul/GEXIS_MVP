import { Stack } from 'expo-router';

export default function ExplorerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="compare" />
      <Stack.Screen name="[geographyId]" />
      <Stack.Screen name="[geographyId]/agents" />
    </Stack>
  );
}
