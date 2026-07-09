import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Radius, T } from '@/constants/appTheme';

interface Props {
  sets: string[];
  /** Selected set, or null for "All". */
  value: string | null;
  onChange: (set: string | null) => void;
  accent: string;
}

/**
 * Horizontally scrollable set selector shown below the series toggle. Lets the
 * user narrow a large series (e.g. Skullpanda's 19 sets) down to one set at a
 * time so Browse stays a short scroll. Mirrors SeriesToggle's pill language.
 */
export function SetFilter({ sets, value, onChange, accent }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      <Chip label="All" active={value === null} accent={accent} onPress={() => onChange(null)} />
      {sets.map((set) => (
        <Chip
          key={set}
          label={set}
          active={value === set}
          accent={accent}
          onPress={() => onChange(set)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  accent,
  onPress,
}: {
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: accent }]}>
      <Text style={[styles.label, active ? styles.labelActive : { color: T.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: T.chip,
  },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  labelActive: { color: '#fff' },
});
