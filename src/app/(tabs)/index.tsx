import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountBar } from '@/components/AccountBar';
import { FigureCard } from '@/components/FigureCard';
import { SeriesToggle } from '@/components/SeriesToggle';
import { SetFilter } from '@/components/SetFilter';
import { ShelfSelector } from '@/components/ShelfSelector';
import { Radius, T } from '@/constants/appTheme';
import { SERIES } from '@/constants/palette';
import { setsForSeries } from '@/data/figures';
import { useCollection } from '@/store/useCollection';
import type { Figure, Series } from '@/types';

const GAP = 12;
const H_PADDING = 16;
const MAX_WIDTH = 900;

export default function BrowseScreen() {
  const router = useRouter();
  const [series, setSeries] = useState<Series>('skullpanda');
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const meta = SERIES[series];

  // Five quick taps opens the admin menu, so it's reachable without a
  // long-press (long-press doesn't fire from a mouse click on web).
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTitlePress = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      router.push('/admin');
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
  };

  // Switching series clears the set filter, since sets are series-specific.
  const changeSeries = (next: Series) => {
    setSeries(next);
    setSelectedSet(null);
  };
  const shelves = useCollection((s) => s.shelves);

  const ownedIds = useMemo(
    () => new Set(shelves.flatMap((sh) => sh.figureIds)),
    [shelves],
  );

  const contentWidth = Math.min(width, MAX_WIDTH) - H_PADDING * 2;
  const columns = Math.max(2, Math.floor((contentWidth + GAP) / (170 + GAP)));
  const cardWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const sets = useMemo(() => setsForSeries(series), [series]);
  const setNames = useMemo(() => sets.map((s) => s.set), [sets]);

  const sections = useMemo(
    () =>
      sets
        .filter((s) => selectedSet === null || s.set === selectedSet)
        .map((s) => ({
          title: s.set,
          count: s.figures.length,
          data: [s.figures] as Figure[][],
        })),
    [sets, selectedSet],
  );

  const shownFigures = useMemo(
    () => sections.flatMap((s) => s.data[0]),
    [sections],
  );
  const ownedShown = shownFigures.filter((f) => ownedIds.has(f.id)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AccountBar />
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(_, i) => String(i)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.h1} onPress={handleTitlePress} onLongPress={() => router.push('/admin')}>
              Browse
            </Text>
            <Text style={styles.subtitle}>Tap + to collect, ♥ to favorite</Text>
            <View style={styles.addingToRow}>
              <ShelfSelector label="Adding to" />
            </View>
            <SeriesToggle value={series} onChange={changeSeries} />
            <View style={styles.setFilterRow}>
              <SetFilter
                sets={setNames}
                value={selectedSet}
                onChange={setSelectedSet}
                accent={meta.accent}
              />
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progress}>
                {ownedShown}/{shownFigures.length} collected
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
  setFilterRow: { marginTop: 10, marginHorizontal: -H_PADDING, paddingHorizontal: H_PADDING },
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
