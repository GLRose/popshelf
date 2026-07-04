import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FigureImage } from '@/components/FigureImage';
import { Radius, T } from '@/constants/appTheme';
import { useCollection } from '@/store/useCollection';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  width: number;
}

export const FigureCard = memo(function FigureCard({ figure, width }: Props) {
  const owned = useCollection((s) => s.collection.includes(figure.id));
  const favorite = useCollection((s) => s.favorites.includes(figure.id));
  const toggleOwned = useCollection((s) => s.toggleOwned);
  const toggleFavorite = useCollection((s) => s.toggleFavorite);

  const imgSize = width - 20; // padding 10 each side

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.imageWrap}>
        <FigureImage figure={figure} size={imgSize} />

        {figure.rarity === 'secret' && (
          <View style={styles.secretBadge}>
            <Ionicons name="sparkles" size={11} color={T.ink} />
            <Text style={styles.secretText}>SECRET</Text>
          </View>
        )}

        <Pressable
          onPress={() => toggleFavorite(figure.id)}
          hitSlop={8}
          style={({ pressed }) => [styles.heart, pressed && styles.pressed]}
          accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}>
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={20}
            color={favorite ? '#FF4D6D' : T.muted}
          />
        </Pressable>
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {figure.name}
      </Text>
      <Text numberOfLines={1} style={styles.set}>
        {figure.set}
      </Text>

      <Pressable
        onPress={() => toggleOwned(figure.id)}
        style={({ pressed }) => [
          styles.addBtn,
          owned && styles.addBtnOwned,
          pressed && styles.pressed,
        ]}
        accessibilityLabel={owned ? 'Remove from collection' : 'Add to collection'}>
        <Ionicons
          name={owned ? 'checkmark' : 'add'}
          size={16}
          color={owned ? '#fff' : T.text}
        />
        <Text style={[styles.addText, owned && styles.addTextOwned]}>
          {owned ? 'In collection' : 'Add'}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: T.border,
    padding: 10,
  },
  imageWrap: { position: 'relative' },
  secretBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.gold,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  secretText: { fontSize: 9, fontWeight: '900', color: T.ink, letterSpacing: 0.5 },
  heart: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: 10, fontSize: 14, fontWeight: '700', color: T.text },
  set: { marginTop: 1, fontSize: 12, color: T.muted },
  addBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.chip,
  },
  addBtnOwned: { backgroundColor: '#4CAF6E', borderColor: '#4CAF6E' },
  addText: { fontSize: 13, fontWeight: '700', color: T.text },
  addTextOwned: { color: '#fff' },
  pressed: { opacity: 0.65 },
});
