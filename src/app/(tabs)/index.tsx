import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountBar } from '@/components/common/AccountBar';
import { ScrollToTopButton, useScrollToTop } from '@/components/common/ScrollToTopButton';
import { FigureCard } from '@/components/figures/FigureCard';
import { SearchBar } from '@/components/figures/SearchBar';
import { SeriesToggle } from '@/components/figures/SeriesToggle';
import { ALL_SETS, SetFilter, type BrowseFilter } from '@/components/figures/SetFilter';
import { ShelfSelector } from '@/components/shelf/ShelfSelector';
import { Radius, T } from '@/constants/appTheme';
import { SERIES } from '@/constants/palette';
import { secretsForSeries, setsForSeries } from '@/data/figures';
import { searchGroups } from '@/lib/search';
import { useCollection } from '@/store/useCollection';
import type { Figure, Series } from '@/types';

const GAP = 12;
const H_PADDING = 16;
const MAX_WIDTH = 900;

/**
 * One rendered block of the grid. `data` holds exactly one row - the whole
 * group of figures - because the grid wraps itself rather than being laid out
 * a row at a time.
 */
interface Section {
  title: string;
  count: number;
  /** Set only for search results, which span IPs and so have to name theirs. */
  series?: Series;
  data: Figure[][];
}

export default function BrowseScreen() {
  const router = useRouter();
  const [series, setSeries] = useState<Series>('skullpanda');
  const [filter, setFilter] = useState<BrowseFilter>(ALL_SETS);
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();

  const meta = SERIES[series];

  // Searching re-renders hundreds of cards, and the keystroke should land in
  // the box before that work happens.
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;

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
    setFilter(ALL_SETS);
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
  const secrets = useMemo(() => secretsForSeries(series), [series]);

  const sections = useMemo<Section[]>(() => {
    // Search deliberately ignores both the series toggle and the set filter:
    // it searches the whole catalog, because not knowing which IP a figure
    // belongs to is a common reason to reach for search in the first place.
    if (searching) {
      return searchGroups(deferredQuery).map((group) => ({
        title: group.set,
        count: group.figures.length,
        series: group.series,
        data: [group.figures],
      }));
    }

    if (filter.kind === 'secrets') {
      return [{ title: 'All Secrets', count: secrets.length, data: [secrets] }];
    }

    return sets
      .filter((s) => filter.kind === 'all' || s.set === filter.set)
      .map((s) => ({
        title: s.set,
        count: s.figures.length,
        data: [s.figures] as Figure[][],
      }));
  }, [searching, deferredQuery, filter, sets, secrets]);

  const shownFigures = useMemo(
    () => sections.flatMap((s) => s.data[0]),
    [sections],
  );
  const ownedShown = shownFigures.filter((f) => ownedIds.has(f.id)).length;

  const listRef = useRef<SectionList<Figure[], Section>>(null);
  const scrollTop = useScrollToTop();
  const scrollToTop = () =>
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AccountBar />
      <SectionList
        ref={listRef}
        onScroll={scrollTop.onScroll}
        scrollEventThrottle={scrollTop.scrollEventThrottle}
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item, i) => item[0]?.id ?? String(i)}
        keyboardShouldPersistTaps="handled"
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
            <View style={styles.searchRow}>
              <SearchBar value={query} onChange={setQuery} accent={meta.accent} />
            </View>
            {/* The IP and set controls are about one IP; a search result set
                is not, so showing them alongside results would misdescribe
                what is on screen. */}
            {!searching && (
              <>
                <SeriesToggle value={series} onChange={changeSeries} />
                <View style={styles.setFilterRow}>
                  <SetFilter
                    sets={setNames}
                    value={filter}
                    onChange={setFilter}
                    accent={meta.accent}
                    secretCount={secrets.length}
                  />
                </View>
              </>
            )}
            <View style={styles.progressRow}>
              {searching && (
                <Text testID="result-count" style={styles.resultCount}>
                  {shownFigures.length} {shownFigures.length === 1 ? 'result' : 'results'}
                </Text>
              )}
              <Text style={styles.progress}>
                {ownedShown}/{shownFigures.length} collected
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No figures match “{deferredQuery.trim()}”</Text>
              <Text style={styles.emptyBody}>
                Try an IP, a set, or part of a figure&apos;s name.
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.series && (
              <View style={[styles.seriesDot, { backgroundColor: SERIES[section.series].accent }]} />
            )}
            <Text testID="section-title" style={styles.sectionTitle}>
              {section.title}
            </Text>
            {section.series && (
              <Text testID="section-series" style={styles.sectionSeries}>
                {SERIES[section.series].label}
              </Text>
            )}
            <Text testID="section-count" style={styles.sectionCount}>
              {section.count}
            </Text>
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
      <ScrollToTopButton
        visible={scrollTop.visible}
        onPress={scrollToTop}
        accent={meta.accent}
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
  searchRow: { marginTop: 10, marginBottom: 12 },
  setFilterRow: { marginTop: 10, marginHorizontal: -H_PADDING, paddingHorizontal: H_PADDING },
  h1: { fontSize: 30, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 13, color: T.muted },
  progressRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  resultCount: { flex: 1, fontSize: 12, fontWeight: '800', color: T.text },
  progress: { fontSize: 12, fontWeight: '700', color: T.muted },
  empty: { paddingTop: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: T.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: T.muted, textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 12,
  },
  seriesDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  sectionSeries: {
    fontSize: 10,
    fontWeight: '900',
    color: T.muted,
    letterSpacing: 0.6,
  },
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
