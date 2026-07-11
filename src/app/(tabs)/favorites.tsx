import { Ionicons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountBar } from '@/components/AccountBar';
import { FigureCard } from '@/components/FigureCard';
import { T } from '@/constants/appTheme';
import { getFigure } from '@/data/figures';
import { useCollection } from '@/store/useCollection';

const GAP = 12;
const H_PADDING = 16;
const MAX_WIDTH = 900;

export default function FavoritesScreen() {
  const { width } = useWindowDimensions();
  const favorites = useCollection((s) => s.favorites);

  const contentWidth = Math.min(width, MAX_WIDTH) - H_PADDING * 2;
  const columns = Math.max(2, Math.floor((contentWidth + GAP) / (170 + GAP)));
  const cardWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const figures = favorites.map(getFigure).filter((f): f is NonNullable<typeof f> => !!f);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AccountBar />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={figures}
        key={columns}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.h1}>Favorites</Text>
            <Text style={styles.subtitle}>
              {figures.length} {figures.length === 1 ? 'figure' : 'figures'} you love · kept off the shelf
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        renderItem={({ item }) => <FigureCard figure={item} width={cardWidth} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={48} color={T.muted} />
            <Text style={styles.emptyTitle}>No favorites yet</Text>
            <Text style={styles.emptyText}>Tap the ♥ on any figure in Browse to save it here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  list: { flex: 1 },
  content: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 32,
    maxWidth: MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  header: { paddingTop: 8, paddingBottom: 16 },
  h1: { fontSize: 30, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 13, color: T.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  emptyText: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },
});
