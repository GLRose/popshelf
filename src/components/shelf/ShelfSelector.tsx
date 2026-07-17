import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ShelfPicker } from '@/components/shelf/ShelfPicker';
import { Radius, T } from '@/constants/appTheme';
import { useCollection } from '@/store/useCollection';

interface Props {
  /** Optional leading label, e.g. "Adding to" */
  label?: string;
  /** Larger, title-styled variant for the Shelf tab header */
  variant?: 'pill' | 'title';
  style?: ViewStyle;
}

export function ShelfSelector({ label, variant = 'pill', style }: Props) {
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const [open, setOpen] = useState(false);

  const active = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];
  const isTitle = variant === 'title';

  return (
    <>
      <View style={[styles.wrap, style]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityLabel="Change shelf"
          style={({ pressed }) => [
            isTitle ? styles.title : styles.pill,
            pressed && { opacity: 0.6 },
          ]}>
          <Text
            numberOfLines={1}
            style={isTitle ? styles.titleText : styles.pillText}>
            {active?.name ?? 'My Shelf'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={isTitle ? 20 : 15}
            color={isTitle ? T.text : T.muted}
          />
        </Pressable>
      </View>

      <ShelfPicker visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: T.muted },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 220,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: T.chip,
    borderWidth: 1,
    borderColor: T.border,
  },
  pillText: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: T.text },
  title: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  titleText: {
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '900',
    color: T.text,
    letterSpacing: -0.5,
  },
});
