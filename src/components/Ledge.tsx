import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { TextureKind } from '@/constants/palette';
import { shade } from '@/lib/color';

interface Props {
  /** Base shelf color the texture is tinted from. */
  color: string;
  texture: TextureKind;
}

/**
 * A single shelf ledge: a lit top surface plus a darker front lip. The texture
 * changes how the top surface is shaded and what fine detail is layered on it,
 * all derived from `color` so material and color stay independent choices.
 */
export function Ledge({ color, texture }: Props) {
  const frontShade = texture === 'glossy' ? -0.42 : texture === 'metal' ? -0.3 : -0.34;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Surface color={color} texture={texture} />
      </View>
      <View style={[styles.front, { backgroundColor: shade(color, frontShade) }]} />
    </View>
  );
}

function Surface({ color, texture }: Props) {
  switch (texture) {
    case 'matte':
      return <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />;

    case 'wood':
      return (
        <>
          <LinearGradient colors={[shade(color, 0.14), color, shade(color, -0.28)]} style={StyleSheet.absoluteFill} />
          {WOOD_GRAIN.map((g, i) => (
            <View key={i} style={[styles.hLine, { top: g.top, backgroundColor: g.color }]} />
          ))}
        </>
      );

    case 'glossy':
      return (
        <>
          <LinearGradient colors={[shade(color, 0.28), color, shade(color, -0.34)]} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
            style={styles.gloss}
          />
        </>
      );

    case 'marble':
      return (
        <>
          <LinearGradient colors={[shade(color, 0.2), shade(color, 0.08), color]} style={StyleSheet.absoluteFill} />
          {MARBLE_VEINS.map((v, i) => (
            <View
              key={i}
              style={[styles.vein, { top: v.top, transform: [{ rotate: v.rotate }], backgroundColor: v.color }]}
            />
          ))}
        </>
      );

    case 'metal':
      return (
        <>
          <LinearGradient
            colors={[shade(color, 0.24), shade(color, -0.08), shade(color, 0.16), shade(color, -0.2)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          {BRUSH_LINES.map((left, i) => (
            <View
              key={i}
              style={[styles.brush, { left, backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
            />
          ))}
        </>
      );

    case 'smooth':
    default:
      return (
        <LinearGradient colors={[shade(color, 0.14), color, shade(color, -0.28)]} style={StyleSheet.absoluteFill} />
      );
  }
}

const WOOD_GRAIN = [
  { top: '16%' as const, color: 'rgba(0,0,0,0.10)' },
  { top: '38%' as const, color: 'rgba(255,255,255,0.10)' },
  { top: '58%' as const, color: 'rgba(0,0,0,0.12)' },
  { top: '80%' as const, color: 'rgba(0,0,0,0.08)' },
];

const MARBLE_VEINS = [
  { top: '30%' as const, rotate: '7deg', color: 'rgba(90,90,110,0.22)' },
  { top: '62%' as const, rotate: '-5deg', color: 'rgba(90,90,110,0.16)' },
];

const BRUSH_LINES = ['8%', '20%', '32%', '44%', '56%', '68%', '80%', '92%'] as const;

const styles = StyleSheet.create({
  wrap: { marginTop: -2 },
  top: {
    height: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    overflow: 'hidden',
  },
  front: {
    height: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  hLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
  vein: { position: 'absolute', left: '-15%', right: '-15%', height: 1 },
  brush: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
