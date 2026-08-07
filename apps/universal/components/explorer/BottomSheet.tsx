import type { ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  height?: number | `${number}%`;
};

/**
 * Custom bottom sheet. On native, render inside a Modal so touches are not
 * stolen by Mapbox's native MapView (RN zIndex cannot cover native map views).
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  height = '72%',
}: Props) {
  const sheet = (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close sheet"
      />
      <View
        style={StyleSheet.flatten([styles.sheet, { height }])}
        pointerEvents="auto"
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>
        {title ? (
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return sheet;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {sheet}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...(Platform.OS === 'web'
      ? { ...StyleSheet.absoluteFill, zIndex: 40 }
      : { flex: 1 }),
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 0,
  },
  sheet: {
    backgroundColor: '#0e0e16',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#1c1c2a',
    maxHeight: '85%',
    zIndex: 1,
    elevation: 12,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  close: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  body: {
    flex: 1,
  },
});
