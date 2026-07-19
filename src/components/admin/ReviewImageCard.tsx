import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { getFigure } from '@/data/figures';
import type { ReviewImage } from '@/lib/adminModeration';

interface Props {
  item: ReviewImage;
  /** Rendered under the figure's details; the pending and approved queues offer different verbs. */
  children: ReactNode;
}

/** Shared layout for a moderated image: thumbnail, which figure it claims to be, and its actions. */
export function ReviewImageCard({ item, children }: Props) {
  const figure = getFigure(item.figureId);
  const submitted = new Date(item.createdAt).toLocaleString();

  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        <Image source={item.url} style={styles.thumbImage} contentFit="contain" />
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {figure ? figure.name : item.figureId}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {figure ? figure.set : 'Unknown figure'}
        </Text>
        <Text style={styles.meta}>Submitted {submitted}</Text>

        <View style={styles.actions}>{children}</View>
      </View>
    </View>
  );
}

export function CardButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
  danger,
  solidDanger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  solidDanger?: boolean;
}) {
  const color = primary || solidDanger ? '#fff' : danger ? T.danger : T.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        danger && styles.btnDanger,
        solidDanger && styles.btnSolidDanger,
        (pressed || disabled) && styles.pressed,
      ]}
      accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </Pressable>
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
  actions: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
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
  btnSolidDanger: { backgroundColor: T.danger, borderColor: T.danger },
  btnText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
