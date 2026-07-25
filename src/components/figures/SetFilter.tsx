import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Radius, T } from '@/constants/appTheme';

/**
 * What Browse is showing within the selected IP: every set, every secret
 * pulled out of its set, or one named set.
 */
export type BrowseFilter =
  | { kind: 'all' }
  | { kind: 'secrets' }
  | { kind: 'set'; set: string };

export const ALL_SETS: BrowseFilter = { kind: 'all' };
export const ALL_SECRETS: BrowseFilter = { kind: 'secrets' };

interface Props {
  sets: string[];
  value: BrowseFilter;
  onChange: (next: BrowseFilter) => void;
  accent: string;
  /** Secrets in this IP. The chip is hidden when there are none. */
  secretCount: number;
}

/**
 * Horizontally scrollable set selector shown below the series toggle. Lets the
 * user narrow a large series (e.g. Skullpanda's 19 sets) down to one set at a
 * time so Browse stays a short scroll. Mirrors SeriesToggle's pill language.
 */
export function SetFilter({ sets, value, onChange, accent, secretCount }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      <Chip
        label="All"
        active={value.kind === 'all'}
        accent={accent}
        onPress={() => onChange(ALL_SETS)}
      />
      {secretCount > 0 && (
        <Chip
          label={`Secrets ${secretCount}`}
          icon="sparkles"
          active={value.kind === 'secrets'}
          // Gold, not the IP accent: it is the same promise the SECRET badge on
          // the card makes, and reading as one thing matters more here than
          // matching the row it sits in.
          accent={T.gold}
          activeTextColor={T.ink}
          onPress={() => onChange(ALL_SECRETS)}
        />
      )}
      {sets.map((set) => (
        <Chip
          key={set}
          label={set}
          active={value.kind === 'set' && value.set === set}
          accent={accent}
          onPress={() => onChange({ kind: 'set', set })}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  icon,
  active,
  accent,
  activeTextColor = '#fff',
  onPress,
}: {
  label: string;
  icon?: 'sparkles';
  active: boolean;
  accent: string;
  activeTextColor?: string;
  onPress: () => void;
}) {
  const color = active ? activeTextColor : T.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, active && { backgroundColor: accent }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: T.chip,
  },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
});
