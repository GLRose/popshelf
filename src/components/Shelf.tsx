import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ShelfItem } from '@/components/ShelfItem';
import { shade } from '@/lib/color';
import type { Figure } from '@/types';

interface Props {
  /** Figures for the current page */
  figures: Figure[];
  columns: number;
  rows: number;
  cellWidth: number;
  shelfColor: string;
  editing: boolean;
  onDelete: (id: string) => void;
}

export function Shelf({ figures, columns, rows, cellWidth, shelfColor, editing, onDelete }: Props) {
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
            {rowFigures.map((f) => (
              <ShelfItem
                key={f.id}
                figure={f}
                size={figureSize}
                cellWidth={cellWidth}
                editing={editing}
                onDelete={() => onDelete(f.id)}
              />
            ))}
          </View>
          {/* ledge */}
          <View style={styles.ledgeWrap}>
            <LinearGradient
              colors={[shade(shelfColor, 0.14), shelfColor, shade(shelfColor, -0.28)]}
              style={styles.ledge}
            />
            <View style={[styles.ledgeFront, { backgroundColor: shade(shelfColor, -0.34) }]} />
          </View>
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
  ledgeWrap: { marginTop: -2 },
  ledge: {
    height: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  ledgeFront: {
    height: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});
