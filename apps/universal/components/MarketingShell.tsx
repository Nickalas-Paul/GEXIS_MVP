import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarketingNav } from '@/components/MarketingNav';

type MarketingShellProps = {
  children: ReactNode;
  /** Light = marketing pages; dark = product docs (methodology). */
  theme?: 'light' | 'dark';
};

export function MarketingShell({ children, theme = 'light' }: MarketingShellProps) {
  const dark = theme === 'dark';

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webContainer, dark && styles.webContainerDark]}>
        <MarketingNav theme={theme} />
        <ScrollView
          style={styles.webScroll}
          contentContainerStyle={[
            styles.webScrollContent,
            dark && styles.webScrollContentDark,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.nativeSafe, dark && styles.nativeSafeDark]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={[styles.nativeHeader, dark && styles.nativeHeaderDark]}>
        <Text style={[styles.brand, dark && styles.brandDark]}>GEXIS</Text>
      </View>
      <ScrollView
        style={styles.nativeScroll}
        contentContainerStyle={[
          styles.nativeScrollContent,
          dark && styles.nativeScrollContentDark,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        <Link href="/explorer" asChild>
          <Pressable style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaText}>Open Explorer</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  webContainerDark: {
    backgroundColor: '#0b0b12',
  },
  webScroll: {
    flex: 1,
  },
  webScrollContent: {
    padding: 24,
    paddingBottom: 64,
    maxWidth: 880,
    width: '100%',
    alignSelf: 'center',
    gap: 12,
  },
  webScrollContentDark: {
    paddingVertical: 32,
  },
  nativeSafe: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  nativeSafeDark: {
    backgroundColor: '#0b0b12',
  },
  nativeHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e2de',
    backgroundColor: '#ffffff',
  },
  nativeHeaderDark: {
    backgroundColor: '#0e0e16',
    borderBottomColor: '#1c1c2a',
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
  },
  brandDark: {
    color: '#ffffff',
  },
  nativeScroll: {
    flex: 1,
  },
  nativeScrollContent: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
  },
  nativeScrollContentDark: {
    paddingBottom: 48,
  },
  cta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
