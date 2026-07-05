import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { SHELF_BACKGROUNDS, SHELF_COLORS } from '@/constants/palette';
import { useCollection } from '@/store/useCollection';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShelfCustomizer({ visible, onClose }: Props) {
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const setShelfColor = useCollection((s) => s.setShelfColor);
  const setShelfBackground = useCollection((s) => s.setShelfBackground);

  const shelf = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            Customize {shelf.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={20} color={T.text} />
          </Pressable>
        </View>

        <Text style={styles.label}>Shelf color</Text>
        <View style={styles.swatchRow}>
          {SHELF_COLORS.map((c) => (
            <Swatch
              key={c.id}
              value={c.value}
              selected={shelf.color === c.value}
              onPress={() => setShelfColor(shelf.id, c.value)}
            />
          ))}
        </View>

        <Text style={styles.label}>Background</Text>
        <View style={styles.swatchRow}>
          {SHELF_BACKGROUNDS.map((b) => (
            <Swatch
              key={b.id}
              value={b.value}
              selected={shelf.background === b.value}
              onPress={() => setShelfBackground(shelf.id, b.value)}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

function Swatch({
  value,
  selected,
  onPress,
}: {
  value: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.swatch, { backgroundColor: value }, selected && styles.swatchSelected]}>
      {selected && (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={16} color={T.text} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 20,
    paddingBottom: 34,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: T.text },
  close: { padding: 4 },
  label: { marginTop: 20, marginBottom: 10, fontSize: 13, fontWeight: '700', color: T.muted },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 3, borderColor: T.text },
  check: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
