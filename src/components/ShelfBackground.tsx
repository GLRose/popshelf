import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import type { Motif, ShelfBackground as BG } from '@/constants/palette';

interface Props {
  background: BG;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Paints a shelf background - either a flat color or a procedurally-drawn
 * wallpaper (gradient + motif) - and renders `children` on top of it.
 */
export function ShelfBackground({ background, style, children }: Props) {
  if (background.kind === 'solid') {
    return <View style={[style, { backgroundColor: background.color }]}>{children}</View>;
  }

  return (
    <View style={[style, styles.clip]}>
      <LinearGradient
        colors={background.gradient as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <MotifLayer motif={background.motif} />
      {children}
    </View>
  );
}

/** Measures its box, then draws the motif sized to fit. */
function MotifLayer({ motif }: { motif: Motif }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size ? renderMotif(motif, size.w, size.h) : null}
    </View>
  );
}

function renderMotif(motif: Motif, w: number, h: number) {
  switch (motif.type) {
    case 'dots':
      return <Dots {...motif} w={w} h={h} />;
    case 'stripes':
      return <Stripes {...motif} w={w} h={h} />;
    case 'clouds':
      return <Clouds color={motif.color} w={w} h={h} />;
    case 'stars':
      return <Stars color={motif.color} w={w} h={h} />;
    case 'hills':
      return <Hills colors={motif.colors} w={w} h={h} />;
    case 'gingham':
      return <Gingham {...motif} w={w} h={h} />;
    case 'checkerboard':
      return <Checkerboard {...motif} w={w} h={h} />;
    case 'grid':
      return <Grid {...motif} w={w} h={h} />;
    case 'bricks':
      return <Bricks {...motif} w={w} h={h} />;
    case 'diamonds':
      return <Diamonds {...motif} w={w} h={h} />;
    case 'confetti':
      return <Confetti colors={motif.colors} w={w} h={h} />;
    case 'hearts':
      return <Hearts {...motif} w={w} h={h} />;
  }
}

/** Safety cap so an unexpectedly large box never spawns thousands of views. */
const MAX_TILES = 500;

function Dots({ color, size, gap, w, h }: { color: string; size: number; gap: number; w: number; h: number }) {
  const step = size + gap;
  const cols = Math.min(40, Math.ceil(w / step) + 1);
  const rows = Math.min(40, Math.ceil(h / step) + 1);
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows && dots.length < MAX_TILES; r++) {
    const offset = r % 2 === 0 ? 0 : step / 2; // staggered brick layout
    for (let c = 0; c < cols && dots.length < MAX_TILES; c++) {
      dots.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * step + offset - size / 2,
            top: r * step - size / 2,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          }}
        />,
      );
    }
  }
  return <>{dots}</>;
}

function Stripes({ color, width, gap, w, h }: { color: string; width: number; gap: number; w: number; h: number }) {
  const step = width + gap;
  const box = Math.ceil(Math.sqrt(w * w + h * h)) + step * 2;
  const count = Math.min(MAX_TILES, Math.ceil(box / step));
  const bars = Array.from({ length: count }, (_, i) => (
    <View
      key={i}
      style={{ position: 'absolute', left: i * step, top: 0, width, height: box, backgroundColor: color }}
    />
  ));
  return (
    <View
      style={{
        position: 'absolute',
        width: box,
        height: box,
        left: (w - box) / 2,
        top: (h - box) / 2,
        transform: [{ rotate: '22deg' }],
      }}>
      {bars}
    </View>
  );
}

function Clouds({ color, w, h }: { color: string; w: number; h: number }) {
  const unit = Math.min(w, h);
  // Relative positions/scales; puffs are three overlapping circles.
  const puffs = [
    { x: 0.14, y: 0.22, s: 1 },
    { x: 0.62, y: 0.12, s: 0.72 },
    { x: 0.8, y: 0.44, s: 1.05 },
    { x: 0.34, y: 0.62, s: 0.85 },
    { x: 0.05, y: 0.78, s: 0.7 },
  ];
  return (
    <>
      {puffs.map((p, i) => {
        const r = unit * 0.11 * p.s;
        const left = w * p.x;
        const top = h * p.y;
        return (
          <View key={i} style={{ position: 'absolute', left, top }}>
            <View style={{ position: 'absolute', left: 0, top: r * 0.5, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color }} />
            <View style={{ position: 'absolute', left: r * 1.1, top: 0, width: r * 2.2, height: r * 2.2, borderRadius: r * 1.1, backgroundColor: color }} />
            <View style={{ position: 'absolute', left: r * 2.4, top: r * 0.5, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color }} />
            <View style={{ position: 'absolute', left: 0, top: r * 1.4, width: r * 4.4, height: r * 1.2, borderRadius: r, backgroundColor: color }} />
          </View>
        );
      })}
    </>
  );
}

// A fixed, hand-scattered star field in normalized [0,1] coordinates so the
// layout is deterministic (no flicker between renders). `s` scales the star.
const STAR_FIELD = [
  [0.08, 0.12, 1], [0.22, 0.3, 0.6], [0.35, 0.09, 0.8], [0.48, 0.24, 0.5],
  [0.6, 0.14, 1], [0.72, 0.32, 0.7], [0.85, 0.1, 0.9], [0.94, 0.28, 0.6],
  [0.13, 0.48, 0.7], [0.28, 0.62, 1], [0.42, 0.5, 0.5], [0.55, 0.68, 0.8],
  [0.68, 0.52, 0.6], [0.8, 0.66, 1], [0.9, 0.5, 0.7], [0.05, 0.72, 0.9],
  [0.2, 0.85, 0.6], [0.38, 0.78, 0.8], [0.52, 0.9, 0.5], [0.66, 0.82, 0.7],
  [0.78, 0.92, 0.9], [0.9, 0.8, 0.6], [0.3, 0.4, 0.5], [0.62, 0.4, 0.6],
] as const;

function Stars({ color, w, h }: { color: string; w: number; h: number }) {
  const unit = Math.min(w, h);
  return (
    <>
      {STAR_FIELD.map(([x, y, s], i) => {
        const d = unit * 0.02 * (s as number) + 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: w * (x as number),
              top: h * (y as number),
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: 0.6 + 0.4 * (s as number),
            }}
          />
        );
      })}
    </>
  );
}

function Hills({ colors, w, h }: { colors: readonly string[]; w: number; h: number }) {
  // Overlapping rounded mounds rising from the bottom, back-to-front.
  return (
    <>
      {colors.map((c, i) => {
        const from = colors.length - i; // back rows are taller
        const height = h * (0.18 + 0.12 * from);
        const width = w * 1.5;
        const left = i % 2 === 0 ? -w * 0.25 : -w * 0.1;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left,
              bottom: -height * 0.35,
              width,
              height,
              borderTopLeftRadius: width,
              borderTopRightRadius: width,
              backgroundColor: c,
            }}
          />
        );
      })}
    </>
  );
}

function Gingham({ color, size, w, h }: { color: string; size: number; w: number; h: number }) {
  // Translucent bars in both directions; the crossings darken naturally.
  const cols = Math.min(40, Math.ceil(w / (size * 2)) + 1);
  const rows = Math.min(40, Math.ceil(h / (size * 2)) + 1);
  const bars: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    bars.push(
      <View key={`v${c}`} style={{ position: 'absolute', left: c * size * 2, top: 0, width: size, height: h, backgroundColor: color }} />,
    );
  }
  for (let r = 0; r < rows; r++) {
    bars.push(
      <View key={`h${r}`} style={{ position: 'absolute', top: r * size * 2, left: 0, height: size, width: w, backgroundColor: color }} />,
    );
  }
  return <>{bars}</>;
}

function Checkerboard({ color, size, w, h }: { color: string; size: number; w: number; h: number }) {
  const cols = Math.min(40, Math.ceil(w / size) + 1);
  const rows = Math.min(40, Math.ceil(h / size) + 1);
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows && cells.length < MAX_TILES; r++) {
    for (let c = 0; c < cols && cells.length < MAX_TILES; c++) {
      if ((r + c) % 2 !== 0) continue;
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{ position: 'absolute', left: c * size, top: r * size, width: size, height: size, backgroundColor: color }}
        />,
      );
    }
  }
  return <>{cells}</>;
}

function Grid({ color, size, w, h }: { color: string; size: number; w: number; h: number }) {
  const cols = Math.min(60, Math.ceil(w / size) + 1);
  const rows = Math.min(60, Math.ceil(h / size) + 1);
  const lines: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    lines.push(
      <View key={`v${c}`} style={{ position: 'absolute', left: c * size, top: 0, width: 1, height: h, backgroundColor: color }} />,
    );
  }
  for (let r = 0; r < rows; r++) {
    lines.push(
      <View key={`h${r}`} style={{ position: 'absolute', top: r * size, left: 0, height: 1, width: w, backgroundColor: color }} />,
    );
  }
  return <>{lines}</>;
}

function Bricks({ color, width, height, w, h }: { color: string; width: number; height: number; w: number; h: number }) {
  const mortar = 3;
  const rows = Math.min(40, Math.ceil(h / height) + 1);
  const cols = Math.min(40, Math.ceil(w / width) + 2);
  const bricks: React.ReactNode[] = [];
  for (let r = 0; r < rows && bricks.length < MAX_TILES; r++) {
    const offset = r % 2 === 0 ? 0 : -width / 2; // running-bond stagger
    for (let c = 0; c < cols && bricks.length < MAX_TILES; c++) {
      bricks.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * width + offset + mortar / 2,
            top: r * height + mortar / 2,
            width: width - mortar,
            height: height - mortar,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />,
      );
    }
  }
  return <>{bricks}</>;
}

function Diamonds({ color, size, w, h }: { color: string; size: number; w: number; h: number }) {
  const side = size * 0.7;
  const cols = Math.min(30, Math.ceil(w / size) + 1);
  const rows = Math.min(30, Math.ceil(h / (size / 2)) + 1);
  const items: React.ReactNode[] = [];
  for (let r = 0; r < rows && items.length < MAX_TILES; r++) {
    const offset = r % 2 === 0 ? 0 : size / 2; // interlocking argyle rows
    for (let c = 0; c < cols && items.length < MAX_TILES; c++) {
      items.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * size + offset - side / 2,
            top: (r * size) / 2 - side / 2,
            width: side,
            height: side,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />,
      );
    }
  }
  return <>{items}</>;
}

// Deterministic scatter field: [x, y, rotationDeg, colorIndex] in [0,1] space.
const CONFETTI_FIELD = [
  [0.06, 0.1, 20, 0], [0.2, 0.18, -35, 1], [0.34, 0.06, 60, 2], [0.48, 0.2, 10, 3],
  [0.62, 0.09, -20, 4], [0.76, 0.22, 45, 0], [0.9, 0.12, -50, 1], [0.12, 0.34, 30, 2],
  [0.28, 0.42, -15, 3], [0.44, 0.32, 55, 4], [0.58, 0.46, -40, 0], [0.72, 0.36, 25, 1],
  [0.86, 0.48, -10, 2], [0.04, 0.56, 40, 3], [0.18, 0.66, -30, 4], [0.32, 0.58, 15, 0],
  [0.46, 0.7, -55, 1], [0.6, 0.6, 35, 2], [0.74, 0.72, -20, 3], [0.88, 0.64, 50, 4],
  [0.1, 0.82, -45, 0], [0.24, 0.9, 20, 1], [0.38, 0.84, -25, 2], [0.52, 0.94, 45, 3],
  [0.66, 0.86, -15, 4], [0.8, 0.92, 30, 0], [0.94, 0.8, -40, 1], [0.16, 0.5, 10, 2],
] as const;

function Confetti({ colors, w, h }: { colors: readonly string[]; w: number; h: number }) {
  const unit = Math.min(w, h);
  const len = Math.max(6, unit * 0.03);
  return (
    <>
      {CONFETTI_FIELD.map(([x, y, rot, ci], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: w * (x as number),
            top: h * (y as number),
            width: len,
            height: len * 0.5,
            borderRadius: 1,
            backgroundColor: colors[(ci as number) % colors.length],
            transform: [{ rotate: `${rot}deg` }],
          }}
        />
      ))}
    </>
  );
}

function Hearts({ color, size, gap, w, h }: { color: string; size: number; gap: number; w: number; h: number }) {
  const step = size + gap;
  const cols = Math.min(24, Math.ceil(w / step) + 1);
  const rows = Math.min(24, Math.ceil(h / step) + 1);
  const hearts: React.ReactNode[] = [];
  const r = size * 0.3;
  for (let ry = 0; ry < rows && hearts.length < MAX_TILES; ry++) {
    const offset = ry % 2 === 0 ? 0 : step / 2; // staggered so hearts nestle
    for (let cx = 0; cx < cols && hearts.length < MAX_TILES; cx++) {
      const left = cx * step + offset;
      const top = ry * step;
      hearts.push(
        <View key={`${ry}-${cx}`} style={{ position: 'absolute', left, top, width: size, height: size }}>
          <View style={{ position: 'absolute', left: 0, top: 0, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color }} />
          <View style={{ position: 'absolute', left: r, top: 0, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color }} />
          <View
            style={{
              position: 'absolute',
              left: r * 0.29,
              top: r * 0.5,
              width: r * 1.42,
              height: r * 1.42,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>,
      );
    }
  }
  return <>{hearts}</>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
