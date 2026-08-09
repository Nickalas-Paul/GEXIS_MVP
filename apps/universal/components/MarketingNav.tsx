import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/services/auth';

const LINKS = [
  { href: '/explorer' as const, label: 'Product' },
  { href: '/marketplace' as const, label: 'Marketplace' },
  { href: '/pricing' as const, label: 'Pricing' },
  { href: '/docs/methodology' as const, label: 'Docs' },
];

type Props = {
  theme?: 'light' | 'dark';
};

export function MarketingNav({ theme = 'light' }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const dark = theme === 'dark';

  return (
    <View style={[styles.nav, dark && styles.navDark]}>
      <Link href="/" asChild>
        <Pressable>
          <Text style={[styles.brand, dark && styles.brandDark]}>GEXIS</Text>
        </Pressable>
      </Link>
      <View style={styles.links}>
        {LINKS.map((item) => (
          <Link key={item.label} href={item.href} asChild>
            <Pressable style={styles.link}>
              <Text style={[styles.linkText, dark && styles.linkTextDark]}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <View style={styles.actions}>
        {!isLoading && isAuthenticated ? (
          <>
            <Text
              style={[styles.userLabel, dark && styles.userLabelDark]}
              numberOfLines={1}
            >
              {user?.email}
            </Text>
            <Link href="/explorer" asChild>
              <Pressable
                style={StyleSheet.flatten([styles.cta, dark && styles.ctaDark])}
              >
                <Text style={styles.ctaText}>Go to Explorer</Text>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={[styles.linkText, dark && styles.linkTextDark]}>
                  Log in
                </Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable
                style={StyleSheet.flatten([styles.cta, dark && styles.ctaDark])}
              >
                <Text style={styles.ctaText}>Start free</Text>
              </Pressable>
            </Link>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e2de',
    backgroundColor: '#ffffff',
    gap: 16,
    flexWrap: 'wrap',
  },
  navDark: {
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
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  link: {
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 14,
  },
  linkTextDark: {
    color: 'rgba(255,255,255,0.75)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  userLabel: {
    fontSize: 13,
    opacity: 0.7,
    maxWidth: 180,
  },
  userLabelDark: {
    color: 'rgba(255,255,255,0.65)',
    opacity: 1,
  },
  cta: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  ctaDark: {
    backgroundColor: '#1a3a6e',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
