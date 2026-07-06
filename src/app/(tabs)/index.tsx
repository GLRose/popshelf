import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FigureCard } from '@/components/FigureCard';
import { SeriesToggle } from '@/components/SeriesToggle';
import { ShelfSelector } from '@/components/ShelfSelector';
import { Radius, T } from '@/constants/appTheme';
import { figuresBySeries, setsForSeries } from '@/data/figures';
import { useCollection } from '@/store/useCollection';
import type { Figure, Series } from '@/types';

const GAP = 12;
const H_PADDING = 16;
const MAX_WIDTH = 900;

export default function BrowseScreen() {
  const [series, setSeries] = useState<Series>('skullpanda');
  const { width } = useWindowDimensions();
  const shelves = useCollection((s) => s.shelves);

  const ownedIds = useMemo(
    () => new Set(shelves.flatMap((sh) => sh.figureIds)),
    [shelves],
  );

  const contentWidth = Math.min(width, MAX_WIDTH) - H_PADDING * 2;
  const columns = Math.max(2, Math.floor((contentWidth + GAP) / (170 + GAP)));
  const cardWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const sections = useMemo(
    () =>
      setsForSeries(series).map((s) => ({
        title: s.set,
        count: s.figures.length,
        data: [s.figures] as Figure[][],
      })),
    [series],
  );

  const seriesFigures = figuresBySeries(series);
  const ownedInSeries = seriesFigures.filter((f) => ownedIds.has(f.id)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(_, i) => String(i)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.h1}>Browse</Text>
            <Text style={styles.subtitle}>Tap + to collect, ♥ to favorite</Text>
            <View style={styles.addingToRow}>
              <ShelfSelector label="Adding to" />
            </View>
            <SeriesToggle value={series} onChange={setSeries} />
            <View style={styles.progressRow}>
              <Text style={styles.progress}>
                {ownedInSeries}/{seriesFigures.length} collected
              </Text>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.count}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.grid, { columnGap: GAP }]}>
            {item.map((f) => (
              <FigureCard key={f.id} figure={f} width={cardWidth} />
            ))}
          </View>
        )}
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
  },
  header: { paddingTop: 8, paddingBottom: 4 },
  addingToRow: { marginTop: 14, marginBottom: 4, flexDirection: 'row' },
  h1: { fontSize: 30, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 13, color: T.muted },
  progressRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  progress: { fontSize: 12, fontWeight: '700', color: T.muted },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: T.muted,
    backgroundColor: T.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: GAP },
});
