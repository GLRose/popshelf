import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ColorPicker, { BrightnessSlider, Panel3, PreviewText } from 'reanimated-color-picker';

import { Ledge } from '@/components/Ledge';
import { ShelfBackground } from '@/components/ShelfBackground';
import { Radius, T } from '@/constants/appTheme';
import {
  SHELF_COLORS,
  SHELF_TEXTURES,
  SHELF_WALLPAPERS,
  getBackground,
  isCustomBackground,
  type ShelfBackground as BG,
  type ShelfTexture,
} from '@/constants/palette';
import { useCollection } from '@/store/useCollection';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShelfCustomizer({ visible, onClose }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const customColors = useCollection((s) => s.customColors);
  const setShelfColor = useCollection((s) => s.setShelfColor);
  const setShelfBackground = useCollection((s) => s.setShelfBackground);
  const setShelfTexture = useCollection((s) => s.setShelfTexture);
  const addCustomColor = useCollection((s) => s.addCustomColor);
  const removeCustomColor = useCollection((s) => s.removeCustomColor);

  const shelf = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];
  const resolvedBg = getBackground(shelf.background);
  const customActive = isCustomBackground(shelf.background);

  const [customOpen, setCustomOpen] = useState(false);
  // Live picker value while dragging; only added to the saved palette on "Save color".
  const [liveColor, setLiveColor] = useState(() =>
    resolvedBg.kind === 'solid' ? resolvedBg.color : shelf.color,
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* The cap lives on `sheet` itself as a plain number, not a '%' string.
          A percentage maxHeight only resolves against a parent with a
          *definite* height - sheetWrap only has a maxHeight of its own, which
          doesn't count, so the percentage was silently ignored and the sheet
          grew to fit all its content instead of capping and scrolling it. */}
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { maxHeight: windowHeight * 0.85 }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              Customize {shelf.name}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}>
              <Ionicons name="close" size={20} color={T.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}>
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

            <View style={styles.labelRow}>
              <Text style={styles.label}>Background</Text>
              {customColors.length > 0 && (
                <Text style={styles.hint}>Hold a color to remove it</Text>
              )}
            </View>
            <View style={styles.swatchRow}>
              {customColors.map((color) => (
                <ColorSwatch
                  key={color}
                  value={color}
                  selected={shelf.background === color}
                  accessibilityLabel={`Saved color ${color}`}
                  onPress={() => {
                    setShelfBackground(shelf.id, color);
                    setCustomOpen(false);
                  }}
                  onLongPress={() => removeCustomColor(color)}
                />
              ))}
              <Pressable
                onPress={() => setCustomOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Pick a custom color"
                style={[
                  styles.swatch,
                  customActive ? { backgroundColor: liveColor } : styles.customSwatch,
                  (customActive || customOpen) && styles.swatchSelected,
                ]}>
                {customActive ? <Check /> : <Ionicons name="eyedrop-outline" size={18} color={T.muted} />}
              </Pressable>
            </View>

            {customOpen && (
              <View style={styles.pickerPanel}>
                <ColorPicker
                  value={liveColor}
                  thumbSize={22}
                  onChangeJS={(c) => setLiveColor(c.hex)}
                  style={styles.picker}>
                  <Panel3 style={styles.pickerWheel} renderCenterLine />
                  <BrightnessSlider style={styles.pickerSlider} />
                  <PreviewText style={styles.previewText} colorFormat="hex" />
                </ColorPicker>
                <Pressable
                  onPress={() => addCustomColor(liveColor)}
                  accessibilityRole="button"
                  style={styles.applyBtn}>
                  <Text style={styles.applyBtnText}>Save color</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.label}>Wallpapers</Text>
            <View style={styles.swatchRow}>
              {SHELF_WALLPAPERS.map((b) => (
                <BgSwatch
                  key={b.id}
                  background={b}
                  selected={shelf.background === b.id}
                  onPress={() => {
                    setShelfBackground(shelf.id, b.id);
                    setCustomOpen(false);
                  }}
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
  onLongPress,
  accessibilityLabel,
}: {
  value: string;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.swatch, { backgroundColor: value }, selected && styles.swatchSelected]}>
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
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.bgSwatch}>
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
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.bgSwatch}>
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
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 20,
    paddingBottom: 34,
    maxWidth: 560,
    width: '100%',
    overflow: 'hidden',
  },
  // minHeight: 0 overrides the flexbox default of min-height: auto, which
  // otherwise refuses to shrink a flex child below its content size on web -
  // flexShrink: 1 alone was not enough to make this actually scroll.
  scrollView: { flexShrink: 1, minHeight: 0 },
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
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  hint: { fontSize: 11, color: T.muted, fontStyle: 'italic' },
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
  customSwatch: {
    backgroundColor: T.chip,
    borderStyle: 'dashed',
  },
  pickerPanel: {
    marginTop: 12,
    padding: 16,
    borderRadius: Radius.md,
    backgroundColor: T.chip,
    alignItems: 'center',
    gap: 16,
  },
  picker: { alignItems: 'center', gap: 14, width: '100%', maxWidth: 240 },
  pickerWheel: { width: 200, height: 200, borderRadius: 100 },
  pickerSlider: { width: '100%', borderRadius: 20 },
  previewText: { fontSize: 13, fontWeight: '700', color: T.text },
  applyBtn: {
    backgroundColor: T.text,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  applyBtnText: { color: T.card, fontWeight: '700', fontSize: 13 },
});
