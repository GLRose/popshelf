import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { T } from '@/constants/appTheme';

/** Title + close affordance for the modal screens (moderation, account). */
export function ScreenHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.h1} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Close">
        <Ionicons name="close" size={22} color={T.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  h1: { flex: 1, fontSize: 20, fontWeight: '900', color: T.text, letterSpacing: -0.4 },
  headerBtn: { padding: 4 },
});
