// Minimal single-stroke "seven segment" font for engraving part numbers.
// Supports 0-9, '-', '.', and a few letters. Returns polylines in mm.

const W = 0.6; // glyph width relative to height
const SEG = {
  a: [[0, 1], [W, 1]],
  b: [[W, 1], [W, 0.5]],
  c: [[W, 0.5], [W, 0]],
  d: [[W, 0], [0, 0]],
  e: [[0, 0], [0, 0.5]],
  f: [[0, 0.5], [0, 1]],
  g: [[0, 0.5], [W, 0.5]],
};
const GLYPHS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', A: 'abcefg', B: 'fgcde', C: 'afed', D: 'bcdeg', E: 'afged', F: 'afge', L: 'fed', P: 'abfge', U: 'bcdef',
};

// Joins consecutive segments of a glyph into as few polylines as possible.
const glyphLines = (ch) => {
  if (ch === '.') return [[[W / 2 - 0.05, 0], [W / 2 + 0.05, 0]]];
  const segs = (GLYPHS[ch.toUpperCase()] || '').split('').map((s) => SEG[s].map((p) => [...p]));
  const lines = [];
  for (const seg of segs) {
    const last = lines[lines.length - 1];
    const end = last && last[last.length - 1];
    if (end && end[0] === seg[0][0] && end[1] === seg[0][1]) last.push(seg[1]);
    else if (end && end[0] === seg[1][0] && end[1] === seg[1][1]) last.push(seg[0]);
    else lines.push(seg);
  }
  return lines;
};

export const textWidth = (text, height) => (text.length * (W + 0.35) - 0.35) * height;

/** Polylines for `text` centred at (cx, cy). */
export const textStrokes = (text, cx, cy, height) => {
  const w = textWidth(text, height);
  const x0 = cx - w / 2, y0 = cy - height / 2;
  const out = [];
  [...String(text)].forEach((ch, i) => {
    const ox = x0 + i * (W + 0.35) * height;
    for (const line of glyphLines(ch)) out.push(line.map(([x, y]) => [ox + x * height, y0 + y * height]));
  });
  return out;
};
