import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ShelfBackground as BG } from '@/constants/palette';

interface Props {
  background: BG;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Paints a shelf background - either a flat color or a real photo wallpaper -
 * and renders `children` on top of it.
 */
export function ShelfBackground({ background, style, children }: Props) {
  if (background.kind === 'solid') {
    return <View style={[style, { backgroundColor: background.color }]}>{children}</View>;
  }

  return (
    <View style={[style, styles.clip]}>
      <Image source={background.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
