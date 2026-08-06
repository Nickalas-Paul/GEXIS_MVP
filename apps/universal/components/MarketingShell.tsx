import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarketingNav } from '@/components/MarketingNav';

type MarketingShellProps = {
  children: ReactNode;
};

export function MarketingShell({ children }: MarketingShellProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <MarketingNav />
        <View style={styles.webBody}>{children}</View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.nativeSafe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.nativeHeader}>
        <Text style={styles.brand}>GEXIS</Text>
      </View>
      <ScrollView
        style={styles.nativeScroll}
        contentContainerStyle={styles.nativeScrollContent}
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
  webBody: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  nativeSafe: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  nativeHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e2de',
    backgroundColor: '#ffffff',
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
  },
  nativeScroll: {
    flex: 1,
  },
  nativeScrollContent: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
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
