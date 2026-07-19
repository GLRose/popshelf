import { useCallback, useEffect, useRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { SERIES, SERIES_ORDER } from '@/constants/palette';
import type { Series } from '@/types';

interface Props {
  value: Series;
  onChange: (s: Series) => void;
}

/** Kept clear of the track's rounded ends when scrolling a segment into view. */
const REVEAL_MARGIN = 16;

function segmentStyle(active: boolean, accent: string): StyleProp<ViewStyle> {
  if (active) {
    return [styles.seg, { backgroundColor: accent }];
  }
  return styles.seg;
}

function labelStyle(active: boolean): StyleProp<TextStyle> {
  if (active) {
    return [styles.label, styles.labelActive];
  }
  return [styles.label, styles.labelIdle];
}

/**
 * Horizontally scrollable IP selector. Segments are sized to their label rather
 * than sharing the width evenly: with `flex: 1` each new IP squeezed the others
 * until long names like SKULLPANDA clipped and PEACH RIOT wrapped onto two
 * lines. Labels now always stay on one line and the track scrolls instead, so
 * the bar keeps working as more IPs are added.
 */
export function SeriesToggle({ value, onChange }: Props) {
  const scroller = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);
  const scrollX = useRef(0);

  const onSegmentLayout = useCallback((id: string) => {
    return (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layouts.current[id] = { x, width };
    };
  }, []);

  // Keep the selected segment on screen - it can be scrolled out of view either
  // by the user or by a selection made from somewhere other than a tap.
  useEffect(() => {
    const seg = layouts.current[value];
    const viewport = viewportWidth.current;
    if (!seg || !viewport) {
      return;
    }

    const left = seg.x - REVEAL_MARGIN;
    const right = seg.x + seg.width + REVEAL_MARGIN;
    let next = scrollX.current;
    if (left < scrollX.current) {
      next = left;
    } else if (right > scrollX.current + viewport) {
      next = right - viewport;
    }
    if (next === scrollX.current) {
      return;
    }

    scroller.current?.scrollTo({ x: Math.max(0, next), animated: true });
  }, [value]);

  return (
    <View style={styles.track}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          viewportWidth.current = e.nativeEvent.layout.width;
        }}
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.row}>
        {SERIES_ORDER.map((id) => {
          const meta = SERIES[id];
          const active = value === id;
          return (
            <Pressable
              key={id}
              onLayout={onSegmentLayout(id)}
              onPress={() => onChange(id)}
              style={segmentStyle(active, meta.accent)}>
              <Text numberOfLines={1} style={labelStyle(active)}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: T.chip,
    borderRadius: Radius.pill,
    padding: 4,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', gap: 4 },
  seg: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  labelActive: { color: '#fff' },
  labelIdle: { color: T.muted },
});
