import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { FigureImage } from '@/components/FigureImage';
import { T } from '@/constants/appTheme';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  size: number;
  cellWidth: number;
  editing: boolean;
  onDelete: () => void;
}

export function ShelfItem({ figure, size, cellWidth, editing, onDelete }: Props) {
  return (
    <View style={[styles.cell, { width: cellWidth }]}>
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
      </View>
    </View>
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
