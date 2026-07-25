import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, TextInput, type TextStyle, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';

/**
 * react-native-web draws the browser's focus ring on the input itself, which
 * lands inside the pill and reads as a second border. The pill's own border
 * already carries the focus state.
 */
const NO_FOCUS_RING: TextStyle | null =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

interface Props {
  value: string;
  onChange: (next: string) => void;
  accent: string;
}

/**
 * Catalog search box. Searches every IP, not the one the series toggle happens
 * to be on, since a user who knows the figure's name does not necessarily know
 * which IP it belongs to - that is often the reason they are searching.
 */
export function SearchBar({ value, onChange, accent }: Props) {
  const active = value.length > 0;

  return (
    <View style={[styles.wrap, active && { borderColor: accent }]}>
      <Ionicons name="search" size={17} color={active ? accent : T.muted} />
      <TextInput
        style={[styles.input, NO_FOCUS_RING]}
        value={value}
        onChangeText={onChange}
        placeholder="Search figures, sets, or IPs"
        placeholderTextColor={T.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search figures"
      />
      {active && (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={8}
          accessibilityLabel="Clear search"
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <Ionicons name="close-circle" size={18} color={T.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text },
  clear: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
