import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ledge } from '@/components/Ledge';
import { ShelfItem } from '@/components/ShelfItem';
import type { TextureKind } from '@/constants/palette';
import type { Figure } from '@/types';

/** Ledge + ledge front, minus ledgeWrap margin. Shared with the drag geometry in ShelfItem. */
export const LEDGE_HEIGHT = 14 + 7 - 2;
/** Gap between shelf rows. Shared with the drag geometry in ShelfItem. */
export const ROW_GAP = 22;

interface Props {
  /** Figures for the current page */
  figures: Figure[];
  columns: number;
  rows: number;
  cellWidth: number;
  shelfColor: string;
  texture: TextureKind;
  editing: boolean;
  onDelete: (id: string) => void;
  onMoveFigure: (figureId: string, toIndex: number) => void;
}

export function Shelf(props: Props) {
  // Keyed on the page's set of figure ids: a page switch or add/remove
  // mounts a fresh ShelfGrid (resetting its live reorder state), while a
  // pure reorder - which round-trips through the same set of ids - doesn't.
  const setKey = props.figures
    .map((f) => f.id)
    .slice()
    .sort()
    .join(',');
  return <ShelfGrid key={setKey} {...props} />;
}

function ShelfGrid({
  figures,
  columns,
  rows,
  cellWidth,
  shelfColor,
  texture,
  editing,
  onDelete,
  onMoveFigure,
}: Props) {
  const figureSize = Math.floor(cellWidth * 0.82);
  const rowStep = figureSize + LEDGE_HEIGHT + ROW_GAP;

  // Live-reorderable copy of this page's figure ids; drives the grid so a
  // drag can preview swaps instantly. Reset by ShelfGrid remounting (see
  // `key` above) whenever the underlying set of ids changes.
  const [order, setOrder] = useState<string[]>(() => figures.map((f) => f.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const figureById = new Map(figures.map((f) => [f.id, f]));
  const orderedFigures = order.map((id) => figureById.get(id)).filter((f): f is Figure => !!f);
  const total = orderedFigures.length;

  const rowChunks: Figure[][] = [];
  for (let r = 0; r < rows; r++) {
    rowChunks.push(orderedFigures.slice(r * columns, r * columns + columns));
  }

  function handleReorderPreview(figureId: string, toIndex: number) {
    setOrder((prev) => {
      const fromIndex = prev.indexOf(figureId);
      if (fromIndex === -1 || fromIndex === toIndex) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
      return next;
    });
  }

  return (
    <View style={styles.wrap}>
      {rowChunks.map((rowFigures, r) => (
        <View key={r} style={styles.row}>
          <View style={[styles.figures, { minHeight: figureSize }]}>
            {rowFigures.map((f, c) => (
              <ShelfItem
                key={f.id}
                figure={f}
                size={figureSize}
                cellWidth={cellWidth}
                index={r * columns + c}
                total={total}
                columns={columns}
                rowStep={rowStep}
                dragging={draggingId === f.id}
                editing={editing}
                onDelete={() => onDelete(f.id)}
                onDragStateChange={(active) => setDraggingId(active ? f.id : null)}
                onReorderPreview={handleReorderPreview}
                onReorderCommit={(toIndex) => onMoveFigure(f.id, toIndex)}
              />
            ))}
          </View>
          <Ledge color={shelfColor} texture={texture} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: ROW_GAP },
  row: {},
  figures: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
