function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('');
}

/** amount: -1..1 (negative darkens, positive lightens) */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return toHex([r + (t - r) * p, g + (t - g) * p, b + (t - b) * p]);
}

/** Returns black or white for best contrast on the given background. */
export function readableOn(hex: string): string {
  const [r, g, b] = parse(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#211C2B' : '#FFFFFF';
}
