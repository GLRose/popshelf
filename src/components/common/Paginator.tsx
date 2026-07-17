import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { T } from '@/constants/appTheme';

interface Props {
  page: number; // 0-based
  pageCount: number;
  onChange: (page: number) => void;
}

export function Paginator({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;
  const canPrev = page > 0;
  const canNext = page < pageCount - 1;

  return (
    <View style={styles.wrap}>
      <Arrow icon="chevron-back" disabled={!canPrev} onPress={() => onChange(page - 1)} />
      <View style={styles.dots}>
        {Array.from({ length: pageCount }).map((_, i) => (
          <Pressable key={i} hitSlop={6} onPress={() => onChange(i)}>
            <View style={[styles.dot, i === page && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>
        {page + 1} / {pageCount}
      </Text>
      <Arrow icon="chevron-forward" disabled={!canNext} onPress={() => onChange(page + 1)} />
    </View>
  );
}

function Arrow({
  icon,
  disabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, disabled && styles.arrowDisabled, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={disabled ? T.border : T.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { backgroundColor: T.bg },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.border },
  dotActive: { backgroundColor: T.text, width: 18 },
  label: { fontSize: 12, fontWeight: '700', color: T.muted, minWidth: 44, textAlign: 'center' },
});
