import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/services/auth';

const LINKS = [
  { href: '/explorer' as const, label: 'Product' },
  { href: '/marketplace' as const, label: 'Marketplace' },
  { href: '/pricing' as const, label: 'Pricing' },
  { href: '/docs/methodology' as const, label: 'Docs' },
];

export function MarketingNav() {
  const { isAuthenticated, user, isLoading } = useAuth();

  return (
    <View style={styles.nav}>
      <Link href="/" asChild>
        <Pressable>
          <Text style={styles.brand}>GEXIS</Text>
        </Pressable>
      </Link>
      <View style={styles.links}>
        {LINKS.map((item) => (
          <Link key={item.label} href={item.href} asChild>
            <Pressable style={styles.link}>
              <Text style={styles.linkText}>{item.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <View style={styles.actions}>
        {!isLoading && isAuthenticated ? (
          <>
            <Text style={styles.userLabel} numberOfLines={1}>
              {user?.email}
            </Text>
            <Link href="/explorer" asChild>
              <Pressable style={styles.cta}>
                <Text style={styles.ctaText}>Go to Explorer</Text>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={styles.linkText}>Log in</Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable style={styles.cta}>
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
  brand: {
    fontSize: 18,
    fontWeight: '700',
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
  cta: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
