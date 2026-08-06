import { Link, Slot, Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const APP_LINKS = [
  { href: '/explorer' as const, label: 'Explorer' },
  { href: '/marketplace' as const, label: 'Marketplace' },
  { href: '/settings' as const, label: 'Settings' },
];

function WebSidebarShell() {
  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <Text style={styles.brand}>GEXIS</Text>
        <Text style={styles.shellLabel}>App shell (sidebar)</Text>
        {APP_LINKS.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable style={styles.navItem}>
              <Text style={styles.navText}>{item.label}</Text>
            </Pressable>
          </Link>
        ))}
        <Link href="/" asChild>
          <Pressable style={styles.navItem}>
            <Text style={styles.navTextMuted}>Marketing home</Text>
          </Pressable>
        </Link>
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

function NativeTabsShell() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a1a1a',
        tabBarInactiveTintColor: '#6b6b6b',
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 8),
          height: 56 + Math.max(insets.bottom, 8),
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e2de',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen name="explorer" options={{ title: 'Explorer' }} />
      <Tabs.Screen name="marketplace" options={{ title: 'Marketplace' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

export default function AppShellLayout() {
  const { width } = useWindowDimensions();
  const useSidebar = Platform.OS === 'web' && width >= 768;

  if (useSidebar) {
    return <WebSidebarShell />;
  }

  // Native (and narrow web): Expo Router Tabs with safe-area-aware tab bar
  return <NativeTabsShell />;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f7f7f5',
  },
  sidebar: {
    width: 220,
    padding: 20,
    gap: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e2de',
    backgroundColor: '#ffffff',
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  shellLabel: {
    fontSize: 12,
    opacity: 0.55,
    marginBottom: 12,
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  navText: {
    fontSize: 15,
    fontWeight: '500',
  },
  navTextMuted: {
    fontSize: 14,
    opacity: 0.6,
  },
  content: {
    flex: 1,
  },
});
