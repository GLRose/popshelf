import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { TEXTURE_IMAGES, type TextureKind } from '@/constants/palette';
import { shade } from '@/lib/color';

interface Props {
  /** Ledge color; only used when `texture` is 'smooth' (flat fill, no photo). */
  color: string;
  texture: TextureKind;
}

/**
 * A single shelf ledge: a lit top surface plus a darker front lip. `smooth`
 * renders the chosen shelf color as a flat fill; every other texture shows a
 * real material photo, darkened with a scrim on the front lip.
 */
export function Ledge({ color, texture }: Props) {
  const image = TEXTURE_IMAGES[texture];

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        {image ? (
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[shade(color, 0.14), color, shade(color, -0.28)]} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={styles.front}>
        {image ? (
          <>
            <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.frontScrim} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: shade(color, -0.34) }]} />
        )}
      </View>
    </View>
  );
}

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
    overflow: 'hidden',
  },
  frontScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
});
