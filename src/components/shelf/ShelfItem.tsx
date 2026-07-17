import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { FigureImage } from '@/components/figures/FigureImage';
import { T } from '@/constants/appTheme';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  size: number;
  cellWidth: number;
  editing: boolean;
  onDelete: () => void;
  /** Swap with the previous figure; omitted when this is the first on the shelf */
  onMoveBack?: () => void;
  /** Swap with the next figure; omitted when this is the last on the shelf */
  onMoveForward?: () => void;
}

export function ShelfItem({
  figure,
  size,
  cellWidth,
  editing,
  onDelete,
  onMoveBack,
  onMoveForward,
}: Props) {
  return (
    <View style={[styles.cell, { width: cellWidth }]}>
      <View style={{ width: size, height: size }}>
        <FigureImage figure={figure} size={size} bare />
        {/* soft contact shadow */}
        <View style={[styles.shadow, { width: size * 0.6, bottom: -2, left: size * 0.2 }]} />
        {editing && (
          <>
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={({ pressed }) => [styles.del, pressed && { opacity: 0.7 }]}
              accessibilityLabel={`Remove ${figure.name} from shelf`}>
              <Ionicons name="close" size={15} color="#fff" />
            </Pressable>
            {/* Kept inside the figure's own footprint: arrows in the gap between
                figures would read as a pair and hide which figure they move. */}
            {onMoveBack && (
              <Pressable
                onPress={onMoveBack}
                hitSlop={6}
                style={({ pressed }) => [styles.arrow, styles.arrowBack, pressed && { opacity: 0.7 }]}
                accessibilityLabel={`Move ${figure.name} one place earlier`}>
                <Ionicons name="chevron-back" size={14} color="#fff" />
              </Pressable>
            )}
            {onMoveForward && (
              <Pressable
                onPress={onMoveForward}
                hitSlop={6}
                style={({ pressed }) => [styles.arrow, styles.arrowForward, pressed && { opacity: 0.7 }]}
                accessibilityLabel={`Move ${figure.name} one place later`}>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const ARROW = 22;

const styles = StyleSheet.create({
  cell: { alignItems: 'center', justifyContent: 'flex-end' },
  shadow: {
    position: 'absolute',
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  del: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  arrow: {
    position: 'absolute',
    bottom: 2,
    width: ARROW,
    height: ARROW,
    borderRadius: ARROW / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  arrowBack: { left: 2 },
  arrowForward: { right: 2 },
});
