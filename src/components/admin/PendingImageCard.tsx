import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { getFigure } from '@/data/figures';
import type { PendingImage } from '@/lib/adminModeration';

interface Props {
  item: PendingImage;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}

export function PendingImageCard({ item, onApprove, onReject, busy }: Props) {
  const figure = getFigure(item.figureId);
  const submitted = new Date(item.createdAt).toLocaleString();

  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        {item.signedUrl ? (
          <Image source={item.signedUrl} style={styles.thumbImage} contentFit="contain" />
        ) : (
          <Ionicons name="image-outline" size={32} color={T.muted} />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {figure ? figure.name : item.figureId}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {figure ? figure.set : 'Unknown figure'}
        </Text>
        <Text style={styles.meta}>Submitted {submitted}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => onReject(item.id)}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.btnDanger, (pressed || busy) && styles.pressed]}
            accessibilityLabel="Reject">
            <Ionicons name="close" size={16} color={T.danger} />
            <Text style={[styles.btnText, { color: T.danger }]}>Reject</Text>
          </Pressable>
          <Pressable
            onPress={() => onApprove(item.id)}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.btnPrimary, (pressed || busy) && styles.pressed]}
            accessibilityLabel="Approve">
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={[styles.btnText, { color: '#fff' }]}>Approve</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: Radius.sm,
    backgroundColor: T.chip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', color: T.text },
  subtitle: { fontSize: 12, color: T.muted },
  meta: { marginTop: 2, fontSize: 11, color: T.muted },
  actions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.chip,
  },
  btnPrimary: { backgroundColor: '#4CAF6E', borderColor: '#4CAF6E' },
  btnDanger: { backgroundColor: T.card, borderColor: T.danger },
  btnText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
