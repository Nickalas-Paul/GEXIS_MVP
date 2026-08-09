import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { MarketingShell } from '@/components/MarketingShell';

type Feature = { text: string; included: boolean };

type TierCard = {
  key: string;
  name: string;
  price: string;
  period: string;
  popular?: boolean;
  features: Feature[];
  cta: string;
  action: 'explorer' | 'placeholder';
};

const TIERS: TierCard[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: [
      { text: '203-country heatmap', included: true },
      { text: '3 filter dimensions', included: true },
      { text: 'Full MVI methodology docs', included: true },
      { text: 'Country-level drill-down', included: true },
      { text: 'Municipal-level data', included: false },
      { text: 'Exports & saved searches', included: false },
    ],
    cta: 'Get started',
    action: 'explorer',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$149',
    period: '/mo',
    popular: true,
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'All 7 MVI dimensions + filters', included: true },
      { text: 'Time horizon projections', included: true },
      { text: 'CSV/PDF exports', included: true },
      { text: 'Saved searches & alerts', included: true },
      { text: 'Agent introductions', included: false },
    ],
    cta: 'Start 14-day trial',
    action: 'placeholder',
  },
  {
    key: 'marketplace',
    name: 'Marketplace',
    price: '$399',
    period: '/mo',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Unlimited agent introductions', included: true },
      { text: 'Engagement tracking', included: true },
      { text: 'Transaction handling', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom MVI weighting', included: true },
    ],
    cta: 'Contact sales',
    action: 'placeholder',
  },
];

const PLACEHOLDER_MSG =
  'Pro subscriptions coming soon. Contact us for early access.';

export default function PricingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const stacked = width < 768;
  const [message, setMessage] = useState<string | null>(null);

  const onCta = (tier: TierCard) => {
    if (tier.action === 'explorer') {
      router.push('/explorer');
      return;
    }
    setMessage(PLACEHOLDER_MSG);
  };

  return (
    <MarketingShell theme="dark">
      <View style={styles.page}>
        <Text style={styles.eyebrow}>PRICING</Text>
        <Text style={styles.title}>Choose your plan</Text>
        <Text style={styles.subtitle}>
          Start free. Upgrade when you need exports, projections, and saved
          searches.
        </Text>

        <View style={[styles.grid, stacked && styles.gridStacked]}>
          {TIERS.map((tier) => (
            <View
              key={tier.key}
              style={[
                styles.card,
                stacked ? styles.cardStacked : styles.cardRow,
                tier.popular && styles.cardPopular,
              ]}
            >
              {tier.popular ? (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                </View>
              ) : null}
              <Text style={styles.tierName}>{tier.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{tier.price}</Text>
                <Text style={styles.period}>{tier.period}</Text>
              </View>
              <View style={styles.features}>
                {tier.features.map((f) => (
                  <View key={f.text} style={styles.featureRow}>
                    <Text
                      style={[
                        styles.featureMark,
                        f.included ? styles.featureYes : styles.featureNo,
                      ]}
                    >
                      {f.included ? '\u2713' : '\u2014'}
                    </Text>
                    <Text
                      style={[
                        styles.featureText,
                        !f.included && styles.featureTextMuted,
                      ]}
                    >
                      {f.text}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={[styles.cta, tier.popular && styles.ctaPopular]}
                onPress={() => onCta(tier)}
              >
                <Text
                  style={[
                    styles.ctaText,
                    tier.popular && styles.ctaTextPopular,
                  ]}
                >
                  {tier.cta}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {message ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{message}</Text>
            <Pressable onPress={() => setMessage(null)} hitSlop={8}>
              <Text style={styles.toastDismiss}>Dismiss</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Annual billing saves 20%. All plans include full MVI methodology
          documentation.
        </Text>
      </View>
    </MarketingShell>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 16,
    paddingBottom: 48,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 560,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
  },
  gridStacked: {
    flexDirection: 'column',
  },
  card: {
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 12,
    padding: 22,
    gap: 14,
  },
  cardRow: {
    flex: 1,
    minWidth: 0,
  },
  cardStacked: {
    width: '100%',
  },
  cardPopular: {
    borderColor: '#3b82f6',
    backgroundColor: '#141a28',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 0 1px rgba(59,130,246,0.35)' } as object)
      : null),
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3b82f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  popularBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  tierName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '700',
  },
  period: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
  },
  features: {
    gap: 10,
    marginTop: 4,
    flexGrow: 1,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  featureMark: {
    fontSize: 14,
    fontWeight: '700',
    width: 14,
  },
  featureYes: {
    color: '#3ecf8e',
  },
  featureNo: {
    color: 'rgba(255,255,255,0.35)',
  },
  featureText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  featureTextMuted: {
    color: 'rgba(255,255,255,0.4)',
  },
  cta: {
    marginTop: 8,
    backgroundColor: '#1c1c2a',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaPopular: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ctaTextPopular: {
    color: '#ffffff',
  },
  toast: {
    marginTop: 8,
    backgroundColor: '#1e2a44',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toastText: {
    color: '#c8dcff',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  toastDismiss: {
    color: '#7aa2ff',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});