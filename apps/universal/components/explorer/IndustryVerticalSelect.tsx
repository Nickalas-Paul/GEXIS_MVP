import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  INDUSTRY_VERTICAL_OPTIONS,
  verticalLabel,
} from '@/lib/industryVerticals';

type Props = {
  value: string;
  onChange: (key: string) => void;
};

const webScrollStyle =
  Platform.OS === 'web'
    ? ({
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#3a3a52 #0e0e16',
      } as object)
    : null;

export default function IndustryVerticalSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<View>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDUSTRY_VERTICAL_OPTIONS;
    return INDUSTRY_VERTICAL_OPTIONS.filter((v) =>
      v.label.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current as unknown as HTMLElement | null;
      if (el && typeof el.contains === 'function' && !el.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Inject dark scrollbar styles once on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'gexis-industry-vertical-scrollbar';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      [data-gexis-vertical-scroll="1"]::-webkit-scrollbar { width: 6px; }
      [data-gexis-vertical-scroll="1"]::-webkit-scrollbar-track {
        background: #0e0e16; border-radius: 3px;
      }
      [data-gexis-vertical-scroll="1"]::-webkit-scrollbar-thumb {
        background: #3a3a52; border-radius: 3px;
      }
      [data-gexis-vertical-scroll="1"]::-webkit-scrollbar-thumb:hover {
        background: #55557a;
      }
    `;
    document.head.appendChild(el);
  }, []);

  return (
    <View ref={wrapRef} style={styles.wrap}>
      <Pressable style={styles.trigger} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {verticalLabel(value)}
        </Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search verticals..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.search}
            autoFocus={Platform.OS === 'web'}
          />
          <ScrollView
            style={[styles.list, webScrollStyle]}
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            // @ts-expect-error RN web data attribute for scrollbar CSS
            dataSet={{ gexisVerticalScroll: '1' }}
          >
            {filtered.map((opt) => {
              const selected = opt.key === value;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    onChange(opt.key);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Text
                    style={[styles.optionText, selected && styles.optionTextSelected]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <Text style={styles.empty}>No matching verticals</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    zIndex: 30,
    elevation: 30,
    position: 'relative',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  triggerText: {
    color: '#e8e8f0',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  chevron: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 8,
    overflow: 'hidden',
    ...(Platform.OS !== 'web'
      ? {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          top: '100%' as const,
          zIndex: 100,
          elevation: 100,
        }
      : null),
  },
  search: {
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 13,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  list: {
    maxHeight: 280,
  },
  listContent: {
    paddingBottom: 4,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionSelected: {
    backgroundColor: 'rgba(26, 58, 110, 0.55)',
  },
  optionText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
  },
  optionTextSelected: {
    color: '#c8dcff',
    fontWeight: '600',
  },
  empty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    padding: 12,
    textAlign: 'center',
  },
});
