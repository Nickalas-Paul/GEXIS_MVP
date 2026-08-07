import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { mviScoreColor } from '@/lib/mviColors';
import type { GeographyFeatureCollection } from '@/services/geographies';

export type SearchResult = {
  id: string;
  name: string;
  isoCode: string | null;
  overall: number | null;
};

type Props = {
  geojson: GeographyFeatureCollection | null;
  onSelect: (result: SearchResult) => void;
  style?: object;
};

function fuzzyMatch(query: string, name: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const n = name.toLowerCase();
  if (n.includes(q)) return true;
  // simple subsequence match for partial typos / fuzzy
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length && q.length >= 2;
}

export default function GeographySearch({ geojson, onSelect, style }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<View>(null);

  const results = useMemo(() => {
    if (!geojson || !query.trim()) return [];
    const matches: SearchResult[] = [];
    for (const f of geojson.features) {
      const name = f.properties?.name;
      if (!name || !fuzzyMatch(query, name)) continue;
      matches.push({
        id: f.properties.id,
        name,
        isoCode: f.properties.isoCode,
        overall: f.properties.overall,
      });
      if (matches.length >= 8) break;
    }
    return matches.sort((a, b) => {
      const aq = a.name.toLowerCase().startsWith(query.trim().toLowerCase()) ? 0 : 1;
      const bq = b.name.toLowerCase().startsWith(query.trim().toLowerCase()) ? 0 : 1;
      if (aq !== bq) return aq - bq;
      return (b.overall ?? -1) - (a.overall ?? -1);
    });
  }, [geojson, query]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const node = wrapRef.current as unknown as { contains?: (n: Node) => boolean } | null;
      const target = e.target as Node;
      if (node && typeof (node as HTMLElement).contains === 'function') {
        if (!(node as unknown as HTMLElement).contains(target)) setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, []);

  return (
    <View ref={wrapRef} style={[styles.wrap, style]}>
      <View style={styles.inputRow}>
        <Text style={styles.icon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search countries..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {open && results.length > 0 ? (
        <View style={styles.dropdown}>
          {results.map((r) => {
            const color = mviScoreColor(r.overall);
            return (
              <Pressable
                key={r.id}
                style={styles.item}
                onPress={() => {
                  onSelect(r);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Text style={styles.itemName} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.itemScore, { color }]}>
                  {r.overall != null ? Math.round(r.overall) : '—'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 420,
    zIndex: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 12, 20, 0.92)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  icon: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#12121c',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  itemName: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  itemScore: {
    fontSize: 13,
    fontWeight: '700',
  },
});
