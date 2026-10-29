// Thin wrapper around Clipper. A "region" is an array of closed integer paths
// (Clipper units, SCALE per mm): outer contours counter-clockwise, holes clockwise.

import ClipperLib from 'clipper-lib';

export const SCALE = 1000; // 1 unit = 1 µm

const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType, PolyTree } = ClipperLib;

export const toClip = (loops) =>
  loops.map((loop) => loop.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })));

export const fromClipPath = (path) => path.map((p) => [p.X / SCALE, p.Y / SCALE]);

const run = (type, subject, clip = [], fill = PolyFillType.pftNonZero) => {
  const c = new Clipper();
  c.AddPaths(subject, PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, PolyType.ptClip, true);
  const solution = [];
  c.Execute(type, solution, fill, PolyFillType.pftNonZero);
  return solution;
};

export const union = (paths, evenOdd = false) =>
  run(ClipType.ctUnion, paths, [], evenOdd ? PolyFillType.pftEvenOdd : PolyFillType.pftNonZero);
export const intersect = (a, b) => run(ClipType.ctIntersection, a, b);
export const difference = (a, b) => run(ClipType.ctDifference, a, b);

export const offset = (paths, deltaMm, join = 'round') => {
  if (!deltaMm) return paths;
  const co = new ClipperOffset(2, 0.01 * SCALE);
  co.AddPaths(paths, join === 'miter' ? JoinType.jtMiter : JoinType.jtRound, EndType.etClosedPolygon);
  const solution = [];
  co.Execute(solution, deltaMm * SCALE);
  return solution;
};

/** Remove near-duplicate points and collinear vertices (tolerance in mm). */
export const clean = (paths, tolMm = 0.02) =>
  Clipper.CleanPolygons(paths, tolMm * SCALE).filter((p) => p.length >= 3);

/** Signed area in mm² (holes subtract). */
export const area = (paths) => paths.reduce((s, p) => s + Clipper.Area(p), 0) / (SCALE * SCALE);

export const circle = (x, y, r, segments) => {
  const n = segments || Math.max(24, Math.min(128, Math.ceil(r * 8)));
  const path = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    path.push({ X: Math.round((x + Math.cos(a) * r) * SCALE), Y: Math.round((y + Math.sin(a) * r) * SCALE) });
  }
  return path;
};

/** Split a region into islands: [{ outer, holes }] (nested islands become separate islands). */
export const islands = (paths) => {
  const c = new Clipper();
  c.AddPaths(paths, PolyType.ptSubject, true);
  const tree = new PolyTree();
  c.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  const result = [];
  const visit = (node) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        result.push({ outer: child.Contour(), holes: child.Childs().map((h) => h.Contour()) });
      }
      visit(child);
    }
  };
  visit(tree);
  return result;
};

export const isOuter = (path) => Clipper.Orientation(path);

export const islandPaths = (island) => [island.outer, ...island.holes];

export const containsPoint = (paths, [x, y]) => {
  const pt = { X: Math.round(x * SCALE), Y: Math.round(y * SCALE) };
  let winding = 0;
  for (const p of paths) {
    if (Clipper.PointInPolygon(pt, p) !== 0) winding += Clipper.Orientation(p) ? 1 : -1;
  }
  return winding > 0;
};

export const bbox = (paths) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const { X, Y } of p) {
    if (X < minX) minX = X;
    if (Y < minY) minY = Y;
    if (X > maxX) maxX = X;
    if (Y > maxY) maxY = Y;
  }
  if (minX === Infinity) return null;
  return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE, w: (maxX - minX) / SCALE, h: (maxY - minY) / SCALE };
};

export const transformPaths = (paths, fn) =>
  paths.map((p) => p.map(({ X, Y }) => {
    const [x, y] = fn(X / SCALE, Y / SCALE);
    return { X: Math.round(x * SCALE), Y: Math.round(y * SCALE) };
  }));

/** Clip closed outlines (treated as lines) to the inside of a region. Returns mm polylines. */
export const clipLinesInside = (lines, region) => {
  const c = new Clipper();
  c.AddPaths(lines.map((p) => [...p, p[0]]), PolyType.ptSubject, false);
  c.AddPaths(region, PolyType.ptClip, true);
  const tree = new PolyTree();
  c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return Clipper.OpenPathsFromPolyTree(tree).filter((p) => p.length >= 2).map(fromClipPath);
};

/** Rough "most interior" point of a region: shrink until it disappears. */
export const interiorPoint = (paths) => {
  const b = bbox(paths);
  if (!b) return null;
  let lo = 0, hi = Math.min(b.w, b.h) / 2, best = paths;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const shrunk = offset(paths, -mid);
    if (shrunk.length && area(shrunk) > 0) { lo = mid; best = shrunk; } else hi = mid;
  }
  const bb = bbox(best);
  const centre = [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2];
  if (containsPoint(best, centre)) return { point: centre, clearance: lo };
  const p = best[0][0];
  return { point: [p.X / SCALE, p.Y / SCALE], clearance: lo };
};
