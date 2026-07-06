import { Text, TextInput } from 'react-native';

/**
 * The single app-wide typeface. Bricolage Grotesque is a variable grotesque
 * with enough character to feel deliberately designed while staying clean and
 * legible at UI sizes. To swap the whole app to a different font, drop a new
 * file in assets/fonts, update the require() in app/_layout.tsx, and change
 * this name to match.
 */
export const FONT_FAMILY = 'BricolageGrotesque';

type Renderable = {
  render: (props: { style?: unknown }, ref: unknown) => unknown;
  __fontPatched?: boolean;
};

/**
 * Apply FONT_FAMILY to every <Text>/<TextInput> without editing each
 * StyleSheet. We patch the component's render to prepend { fontFamily } to the
 * *incoming* style prop, then let React Native (and react-native-web) lower it
 * normally. Injecting into the input - rather than the rendered output - is
 * what makes this work on web: RNW's base Text style hardcodes `font: 14px
 * System`, and a fontFamily set on the style prop is the supported way to
 * override it.
 *
 * fontFamily is the *base* of the array, so anything a component sets
 * (fontWeight, fontStyle, and crucially the icon fonts used by
 * @expo/vector-icons) comes later and wins.
 */
function installGlobalFont() {
  for (const Component of [Text, TextInput] as unknown as Renderable[]) {
    if (Component.__fontPatched) continue;
    const original = Component.render;
    Component.render = function (props, ref) {
      const style = [{ fontFamily: FONT_FAMILY }, props?.style];
      return original.call(this, { ...props, style }, ref);
    };
    Component.__fontPatched = true;
  }
}

installGlobalFont();
