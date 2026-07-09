import { StyleSheet, View } from 'react-native';

import { Ledge } from '@/components/Ledge';
import { ShelfItem } from '@/components/ShelfItem';
import type { TextureKind } from '@/constants/palette';
import type { Figure } from '@/types';

interface Props {
  /** Figures for the current page */
  figures: Figure[];
  /** Index of `figures[0]` within the whole shelf, so reordering can span pages */
  startIndex: number;
  /** Figures on the whole shelf, not just this page */
  totalFigures: number;
  columns: number;
  rows: number;
  cellWidth: number;
  shelfColor: string;
  texture: TextureKind;
  editing: boolean;
  onDelete: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}

export function Shelf({
  figures,
  startIndex,
  totalFigures,
  columns,
  rows,
  cellWidth,
  shelfColor,
  texture,
  editing,
  onDelete,
  onMove,
}: Props) {
  const figureSize = Math.floor(cellWidth * 0.82);
  // Split page figures into rows of `columns`
  const rowChunks: Figure[][] = [];
  for (let r = 0; r < rows; r++) {
    rowChunks.push(figures.slice(r * columns, r * columns + columns));
  }

  return (
    <View style={styles.wrap}>
      {rowChunks.map((rowFigures, r) => (
        <View key={r} style={styles.row}>
          <View style={[styles.figures, { minHeight: figureSize }]}>
            {rowFigures.map((f, c) => {
              const index = startIndex + r * columns + c;
              return (
                <ShelfItem
                  key={f.id}
                  figure={f}
                  size={figureSize}
                  cellWidth={cellWidth}
                  editing={editing}
                  onDelete={() => onDelete(f.id)}
                  onMoveBack={index > 0 ? () => onMove(f.id, -1) : undefined}
                  onMoveForward={index < totalFigures - 1 ? () => onMove(f.id, 1) : undefined}
                />
              );
            })}
          </View>
          <Ledge color={shelfColor} texture={texture} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  row: {},
  figures: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
