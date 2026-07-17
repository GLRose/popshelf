import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { SERIES, SERIES_ORDER } from '@/constants/palette';
import type { Series } from '@/types';

interface Props {
  value: Series;
  onChange: (s: Series) => void;
}

export function SeriesToggle({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {SERIES_ORDER.map((id) => {
        const meta = SERIES[id];
        const active = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            style={[styles.seg, active && { backgroundColor: meta.accent }]}>
            <Text style={[styles.label, active ? styles.labelActive : { color: T.muted }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: T.chip,
    borderRadius: Radius.pill,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  labelActive: { color: '#fff' },
});
