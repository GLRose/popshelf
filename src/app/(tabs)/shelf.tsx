import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Shelf } from '@/components/Shelf';
import { ShelfCustomizer } from '@/components/ShelfCustomizer';
import { ShelfSelector } from '@/components/ShelfSelector';
import { Paginator } from '@/components/Paginator';
import { Radius, T } from '@/constants/appTheme';
import { getFigure } from '@/data/figures';
import { readableOn } from '@/lib/color';
import { useCollection } from '@/store/useCollection';

const H_PADDING = 16;
const MAX_WIDTH = 900;

export default function ShelfScreen() {
  const { width, height } = useWindowDimensions();
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const removeOwned = useCollection((s) => s.removeOwned);

  const shelf = shelves.find((s) => s.id === activeShelfId) ?? shelves[0];

  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [customizing, setCustomizing] = useState(false);

  const figures = shelf.figureIds
    .map(getFigure)
    .filter((f): f is NonNullable<typeof f> => !!f);

  const contentWidth = Math.min(width, MAX_WIDTH) - H_PADDING * 2;
  const columns = Math.min(8, Math.max(3, Math.floor((contentWidth - 24) / 112)));
  const rows = height < 720 ? 2 : 3;
  const perPage = columns * rows;
  const cellWidth = Math.floor((contentWidth - 24) / columns);

  const pageCount = Math.max(1, Math.ceil(figures.length / perPage));

  // Clamp during render so the page stays in range as the collection shrinks/grows.
  const currentPage = Math.min(page, pageCount - 1);
  const pageFigures = figures.slice(currentPage * perPage, currentPage * perPage + perPage);
  const onBg = readableOn(shelf.background);

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
            <View style={[styles.shelfCard, { backgroundColor: shelf.background }]}>
              {editing && (
                <View style={[styles.editHint, { borderColor: onBg }]}>
                  <Text style={[styles.editHintText, { color: onBg }]}>
                    Tap ✕ to remove a figure
                  </Text>
                </View>
              )}
              <Shelf
                figures={pageFigures}
                columns={columns}
                rows={rows}
                cellWidth={cellWidth}
                shelfColor={shelf.color}
                editing={editing}
                onDelete={removeOwned}
              />
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
  shelfCard: {
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
