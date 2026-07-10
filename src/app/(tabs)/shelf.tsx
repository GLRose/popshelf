import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Shelf } from '@/components/Shelf';
import { ShelfBackground } from '@/components/ShelfBackground';
import { ShelfCustomizer } from '@/components/ShelfCustomizer';
import { ShelfSelector } from '@/components/ShelfSelector';
import { Paginator } from '@/components/Paginator';
import { Radius, T } from '@/constants/appTheme';
import { getBackground, getTexture } from '@/constants/palette';
import { getFigure } from '@/data/figures';
import { useAuth } from '@/store/useAuth';
import { useCollection } from '@/store/useCollection';

const H_PADDING = 16;
const MAX_WIDTH = 900;

// Shelf-card geometry, kept in sync with the card padding here and the per-row
// layout in Shelf.tsx, so we can pack rows without measuring each one.
const CARD_V_PADDING = 30 + 12; // shelfCard paddingTop + paddingBottom
const ROW_GAP = 22; // Shelf `wrap` gap between rows
const LEDGE_HEIGHT = 14 + 7 - 2; // ledge + ledge front, minus ledgeWrap margin
const EDIT_HINT_HEIGHT = 35; // pill + its marginBottom, only while editing
const MAX_ROWS = 8;

/**
 * Fit as many shelf rows as the measured area allows. Falls back to a
 * height-based estimate for the first frame, before the card has laid out.
 */
function computeRows(areaHeight: number, figureSize: number, editing: boolean, windowHeight: number) {
  if (areaHeight <= 0) return windowHeight < 720 ? 2 : 3;
  const rowHeight = figureSize + LEDGE_HEIGHT;
  const usable = areaHeight - CARD_V_PADDING - (editing ? EDIT_HINT_HEIGHT : 0);
  const fit = Math.floor((usable + ROW_GAP) / (rowHeight + ROW_GAP));
  return Math.max(1, Math.min(MAX_ROWS, fit));
}

export default function ShelfScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const authStatus = useAuth((s) => s.status);
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const removeOwned = useCollection((s) => s.removeOwned);
  const moveOwned = useCollection((s) => s.moveOwned);

  const shelf = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];

  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  // Height available to the shelf card, measured once it lays out.
  const [shelfAreaHeight, setShelfAreaHeight] = useState(0);

  const figures = shelf.figureIds
    .map(getFigure)
    .filter((f): f is NonNullable<typeof f> => !!f);

  const contentWidth = Math.min(width, MAX_WIDTH) - H_PADDING * 2;
  const columns = Math.min(8, Math.max(3, Math.floor((contentWidth - 24) / 112)));
  const cellWidth = Math.floor((contentWidth - 24) / columns);
  const figureSize = Math.floor(cellWidth * 0.82);

  // Fit as many rows as the device height allows. These constants mirror the
  // shelf card padding and the per-row height built in Shelf.tsx (figure +
  // ledge + inter-row gap), so the last row always clears the tab bar.
  const rows = computeRows(shelfAreaHeight, figureSize, editing, height);
  const perPage = columns * rows;

  const pageCount = Math.max(1, Math.ceil(figures.length / perPage));

  // Clamp during render so the page stays in range as the collection shrinks/grows.
  const currentPage = Math.min(page, pageCount - 1);
  const startIndex = currentPage * perPage;
  const pageFigures = figures.slice(startIndex, startIndex + perPage);
  const background = getBackground(shelf.background);
  const texture = getTexture(shelf.texture).kind;
  const onBg = background.foreground;

  // Shift a figure one slot, following it to the next/previous page when the
  // swap carries it off the one being viewed.
  function handleMove(id: string, delta: number) {
    const to = figures.findIndex((f) => f.id === id) + delta;
    if (to < 0 || to >= figures.length) return;
    setPage(Math.floor(to / perPage));
    moveOwned(id, delta);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ShelfSelector variant="title" />
            <Text style={styles.subtitle}>
              {figures.length} {figures.length === 1 ? 'figure' : 'figures'} on display
            </Text>
          </View>
          <View style={styles.actions}>
            {authStatus !== 'unconfigured' && (
              <IconBtn
                icon={authStatus === 'signedIn' ? 'person-circle' : 'person-circle-outline'}
                onPress={() => router.push('/account')}
                label={authStatus === 'signedIn' ? 'Account' : 'Save your shelves'}
              />
            )}
            <IconBtn
              icon="color-palette-outline"
              onPress={() => setCustomizing(true)}
              label="Customize shelf"
            />
            <IconBtn
              icon={editing ? 'checkmark' : 'create-outline'}
              active={editing}
              onPress={() => setEditing((e) => !e)}
              label={editing ? 'Done editing' : 'Edit shelf'}
            />
          </View>
        </View>

        {figures.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={48} color={T.muted} />
            <Text style={styles.emptyTitle}>Your shelf is empty</Text>
            <Text style={styles.emptyText}>
              Head to Browse and tap + on figures to start your display.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={styles.shelfArea}
              onLayout={(e) => setShelfAreaHeight(e.nativeEvent.layout.height)}>
              <ShelfBackground background={background} style={styles.shelfCard}>
                {editing && (
                  <View style={[styles.editHint, { borderColor: onBg }]}>
                    <Text style={[styles.editHintText, { color: onBg }]}>
                      Tap ✕ to remove, ‹ › to reorder
                    </Text>
                  </View>
                )}
                <Shelf
                  figures={pageFigures}
                  startIndex={startIndex}
                  totalFigures={figures.length}
                  columns={columns}
                  rows={rows}
                  cellWidth={cellWidth}
                  shelfColor={shelf.color}
                  texture={texture}
                  editing={editing}
                  onDelete={removeOwned}
                  onMove={handleMove}
                />
              </ShelfBackground>
            </View>
            <Paginator page={currentPage} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </View>

      <ShelfCustomizer visible={customizing} onClose={() => setCustomizing(false)} />
    </SafeAreaView>
  );
}

function IconBtn({
  icon,
  onPress,
  active,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, active && styles.iconBtnActive, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={active ? '#fff' : T.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  container: {
    flex: 1,
    paddingHorizontal: H_PADDING,
    maxWidth: MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerText: { flex: 1, marginRight: 10 },
  subtitle: { marginTop: 2, fontSize: 13, color: T.muted },
  actions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#4CAF6E', borderColor: '#4CAF6E' },
  shelfArea: { flex: 1 },
  shelfCard: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingTop: 30,
    paddingBottom: 12,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  editHint: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
    opacity: 0.9,
  },
  editHintText: { fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  emptyText: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },
});
