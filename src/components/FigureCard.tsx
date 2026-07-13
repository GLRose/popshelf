import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AddImageModal } from '@/components/AddImageModal';
import { FigureImage } from '@/components/FigureImage';
import { Radius, T } from '@/constants/appTheme';
import { useCollection } from '@/store/useCollection';
import { useUserImages } from '@/store/useUserImages';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  width: number;
}

export const FigureCard = memo(function FigureCard({ figure, width }: Props) {
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const favorite = useCollection((s) => s.favorites.includes(figure.id));
  const addToActiveShelf = useCollection((s) => s.addToActiveShelf);
  const removeOwned = useCollection((s) => s.removeOwned);
  const toggleFavorite = useCollection((s) => s.toggleFavorite);

  const location = shelves.find((sh) => sh.figureIds.includes(figure.id));
  const onActiveShelf = location?.id === activeShelfId;
  const onOtherShelf = !!location && !onActiveShelf;

  // Every figure takes a user image now. It used to be only the ones with no
  // bundled cutout, because a bundled image won unconditionally and there was
  // no way for a user's pick to show. Nothing is bundled any more - catalog art
  // is just another image from the server - so a user can replace any of it, and
  // removing theirs falls back to whatever the server serves.
  const hasUserImage = useUserImages((s) => !!(s.mine[figure.id] ?? s.community[figure.id]));
  const [imageModalOpen, setImageModalOpen] = useState(false);

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

        <Pressable
          onPress={() => setImageModalOpen(true)}
          hitSlop={8}
          style={({ pressed }) => [styles.camera, pressed && styles.pressed]}
          accessibilityLabel={
            hasUserImage ? `Edit image for ${figure.name}` : `Add image for ${figure.name}`
          }>
          <Ionicons name={hasUserImage ? 'camera' : 'camera-outline'} size={17} color={T.muted} />
        </Pressable>
      </View>

      {imageModalOpen && (
        <AddImageModal figure={figure} onClose={() => setImageModalOpen(false)} />
      )}

      <Text numberOfLines={1} style={styles.name}>
        {figure.name}
      </Text>
      <Text numberOfLines={1} style={styles.set}>
        {figure.set}
      </Text>

      <Pressable
        onPress={() => (onActiveShelf ? removeOwned(figure.id) : addToActiveShelf(figure.id))}
        style={({ pressed }) => [
          styles.addBtn,
          onActiveShelf && styles.addBtnOwned,
          onOtherShelf && styles.addBtnOther,
          pressed && styles.pressed,
        ]}
        accessibilityLabel={
          onActiveShelf
            ? 'Remove from this shelf'
            : onOtherShelf
              ? `Move here from ${location!.name}`
              : 'Add to shelf'
        }>
        <Ionicons
          name={onActiveShelf ? 'checkmark' : onOtherShelf ? 'swap-horizontal' : 'add'}
          size={16}
          color={onActiveShelf ? '#fff' : T.text}
        />
        <Text
          numberOfLines={1}
          style={[styles.addText, onActiveShelf && styles.addTextOwned]}>
          {onActiveShelf ? location!.name : onOtherShelf ? `On ${location!.name}` : 'Add'}
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
  camera: {
    position: 'absolute',
    bottom: 6,
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
  addBtnOther: { backgroundColor: T.card, borderColor: T.muted, borderStyle: 'dashed' },
  addText: { fontSize: 13, fontWeight: '700', color: T.text },
  addTextOwned: { color: '#fff' },
  pressed: { opacity: 0.65 },
});
