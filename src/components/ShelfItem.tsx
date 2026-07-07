import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { FigureImage } from '@/components/FigureImage';
import { T } from '@/constants/appTheme';
import type { Figure } from '@/types';

const DRAG_ACTIVATE_MS = 350;
const BADGE_HIT_SIZE = 32;
const TAP_MOVE_THRESHOLD = 10;

interface Props {
  figure: Figure;
  size: number;
  cellWidth: number;
  /** Flat index of this figure within the current page's grid */
  index: number;
  /** Total figures on the current page, for last-row centering math */
  total: number;
  columns: number;
  /** Vertical pixel distance between row origins (figure + ledge + gap) */
  rowStep: number;
  /** Whether this item is the one currently being dragged */
  dragging: boolean;
  editing: boolean;
  onDelete: () => void;
  onDragStateChange: (active: boolean) => void;
  onReorderPreview: (figureId: string, toIndex: number) => void;
  onReorderCommit: (toIndex: number) => void;
}

/** Pixel center of grid cell `index`, accounting for the last row being center-justified when partial. */
function cellCenter(
  index: number,
  columns: number,
  total: number,
  cellWidth: number,
  rowStep: number,
  size: number,
) {
  'worklet';
  const row = Math.floor(index / columns);
  const col = index % columns;
  const lastRow = Math.floor(Math.max(total - 1, 0) / columns);
  const rowItemCount = row === lastRow ? total - lastRow * columns : columns;
  const rowStartX = ((columns - rowItemCount) * cellWidth) / 2;
  return {
    x: rowStartX + col * cellWidth + cellWidth / 2,
    y: row * rowStep + size / 2,
  };
}

/** Index of the grid cell whose center is closest to (x, y). */
function nearestIndex(
  x: number,
  y: number,
  total: number,
  columns: number,
  cellWidth: number,
  rowStep: number,
  size: number,
) {
  'worklet';
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < total; i++) {
    const c = cellCenter(i, columns, total, cellWidth, rowStep, size);
    const dx = c.x - x;
    const dy = c.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function ShelfItem({
  figure,
  size,
  cellWidth,
  index,
  total,
  columns,
  rowStep,
  dragging,
  editing,
  onDelete,
  onDragStateChange,
  onReorderPreview,
  onReorderCommit,
}: Props) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(0);
  const startIndex = useSharedValue(index);
  const currentIndex = useSharedValue(index);

  const pan = Gesture.Pan()
    .activateAfterLongPress(DRAG_ACTIVATE_MS)
    .onStart(() => {
      startIndex.value = index;
      currentIndex.value = index;
      isActive.value = withSpring(1);
      runOnJS(onDragStateChange)(true);
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const origin = cellCenter(startIndex.value, columns, total, cellWidth, rowStep, size);
      const target = nearestIndex(
        origin.x + e.translationX,
        origin.y + e.translationY,
        total,
        columns,
        cellWidth,
        rowStep,
        size,
      );
      if (target !== currentIndex.value) {
        currentIndex.value = target;
        runOnJS(onReorderPreview)(figure.id, target);
      }
    })
    .onEnd((e) => {
      const isTap =
        Math.abs(e.translationX) < TAP_MOVE_THRESHOLD && Math.abs(e.translationY) < TAP_MOVE_THRESHOLD;
      const onBadge = e.x > size - BADGE_HIT_SIZE && e.y < BADGE_HIT_SIZE;
      if (isTap && onBadge) {
        runOnJS(onDelete)();
      } else if (currentIndex.value !== startIndex.value) {
        runOnJS(onReorderCommit)(currentIndex.value);
      }
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      isActive.value = withSpring(0);
      runOnJS(onDragStateChange)(false);
    });

  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: 1 + isActive.value * 0.12 },
    ],
    zIndex: isActive.value > 0.01 ? 10 : 0,
    shadowOpacity: isActive.value * 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: isActive.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.cell, { width: cellWidth }, liftStyle]}
        layout={dragging ? undefined : LinearTransition.springify()}>
        <View style={{ width: size, height: size }}>
          <FigureImage figure={figure} size={size} bare />
          {/* soft contact shadow */}
          <View style={[styles.shadow, { width: size * 0.6, bottom: -2, left: size * 0.2 }]} />
          {editing && (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={({ pressed }) => [styles.del, pressed && { opacity: 0.7 }]}
              accessibilityLabel={`Remove ${figure.name} from shelf`}>
              <Ionicons name="close" size={15} color="#fff" />
            </Pressable>
          )}
          <Animated.View pointerEvents="none" style={[styles.del, badgeStyle]}>
            <Ionicons name="close" size={15} color="#fff" />
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

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
});
