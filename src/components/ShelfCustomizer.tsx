import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ledge } from '@/components/Ledge';
import { ShelfBackground } from '@/components/ShelfBackground';
import { Radius, T } from '@/constants/appTheme';
import {
  SHELF_COLORS,
  SHELF_SOLIDS,
  SHELF_TEXTURES,
  SHELF_WALLPAPERS,
  type ShelfBackground as BG,
  type ShelfTexture,
} from '@/constants/palette';
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
  const setShelfTexture = useCollection((s) => s.setShelfTexture);

  const shelf = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>Shelf color</Text>
            <View style={styles.swatchRow}>
              {SHELF_COLORS.map((c) => (
                <ColorSwatch
                  key={c.id}
                  value={c.value}
                  selected={shelf.color === c.value}
                  onPress={() => setShelfColor(shelf.id, c.value)}
                />
              ))}
            </View>

            <Text style={styles.label}>Shelf texture</Text>
            <View style={styles.swatchRow}>
              {SHELF_TEXTURES.map((t) => (
                <TextureSwatch
                  key={t.id}
                  texture={t}
                  color={shelf.color}
                  selected={shelf.texture === t.id}
                  onPress={() => setShelfTexture(shelf.id, t.id)}
                />
              ))}
            </View>

            <Text style={styles.label}>Background</Text>
            <View style={styles.swatchRow}>
              {SHELF_SOLIDS.map((b) => (
                <BgSwatch
                  key={b.id}
                  background={b}
                  selected={shelf.background === b.id}
                  onPress={() => setShelfBackground(shelf.id, b.id)}
                />
              ))}
            </View>

            <Text style={styles.label}>Wallpapers</Text>
            <View style={styles.swatchRow}>
              {SHELF_WALLPAPERS.map((b) => (
                <BgSwatch
                  key={b.id}
                  background={b}
                  selected={shelf.background === b.id}
                  onPress={() => setShelfBackground(shelf.id, b.id)}
                  showLabel
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ColorSwatch({
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
      {selected && <Check />}
    </Pressable>
  );
}

function BgSwatch({
  background,
  selected,
  onPress,
  showLabel,
}: {
  background: BG;
  selected: boolean;
  onPress: () => void;
  showLabel?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.bgSwatch}>
      <ShelfBackground
        background={background}
        style={[styles.swatch, styles.swatchClip, selected && styles.swatchSelected]}>
        {selected && <Check />}
      </ShelfBackground>
      {showLabel && (
        <Text style={styles.swatchLabel} numberOfLines={1}>
          {background.label}
        </Text>
      )}
    </Pressable>
  );
}

function TextureSwatch({
  texture,
  color,
  selected,
  onPress,
}: {
  texture: ShelfTexture;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.bgSwatch}>
      <View style={[styles.textureSwatch, selected && styles.swatchSelected]}>
        <Ledge color={color} texture={texture.kind} />
      </View>
      <Text style={styles.swatchLabel} numberOfLines={1}>
        {texture.label}
      </Text>
    </Pressable>
  );
}

function Check() {
  return (
    <View style={styles.check}>
      <Ionicons name="checkmark" size={16} color={T.text} />
    </View>
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
  // Positioning lives on a flex wrapper because react-native-web ignores
  // alignSelf/auto margins on absolutely-positioned views, which pinned the
  // sheet to the left edge on wide viewports.
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    maxHeight: '85%',
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 20,
    paddingBottom: 34,
    maxWidth: 560,
    width: '100%',
    maxHeight: '100%',
  },
  scroll: { paddingBottom: 8 },
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
  swatchClip: { overflow: 'hidden' },
  textureSwatch: {
    width: 54,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: T.chip,
    paddingHorizontal: 6,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgSwatch: { alignItems: 'center', gap: 4, width: 54 },
  swatchLabel: { fontSize: 10, fontWeight: '600', color: T.muted, textAlign: 'center' },
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
