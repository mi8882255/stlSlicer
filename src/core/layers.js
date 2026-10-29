// Layer planning: sheets of thickness `t` separated by gaps `g`, contour per
// sheet, alignment guide holes, auto guide placement and per-part breakdown.

import { prepareMesh, sliceAt } from './slice.js';
import { weld } from './mesh.js';
import * as G from './geom.js';

export const DEFAULT_SETTINGS = {
  thickness: 10, // sheet thickness, mm
  gap: 5, // empty space between sheets (filled later), mm
  startOffset: 0, // Z where the first sheet begins, mm
  contour: 'middle', // middle | bottom | top | outer | inner
  samples: 3, // number of cuts per sheet for outer/inner
  minIslandArea: 4, // drop specks smaller than this, mm²
  simplify: 0.05, // contour simplification tolerance, mm
  evenOdd: false, // use even-odd fill (for meshes with broken normals)
};

const EPS = 1e-4;

export const prepare = (tris) => prepareMesh(weld(tris));

const sampleHeights = (z0, z1, mode, samples) => {
  const lo = z0 + EPS, hi = z1 - EPS;
  if (mode === 'bottom') return [lo];
  if (mode === 'top') return [hi];
  if (mode === 'middle') return [(z0 + z1) / 2];
  const n = Math.max(2, samples | 0);
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};

const sliceRegion = (mesh, z, s) => G.union(G.toClip(sliceAt(mesh, z)), s.evenOdd);

const dropSpecks = (region, minArea) => {
  const keep = G.islands(region).filter((isl) => G.area(G.islandPaths(isl)) >= minArea);
  return keep.flatMap(G.islandPaths);
};

/** Slice the prepared mesh into sheets. Returns [{ index, z0, z1, region }]. */
export const buildLayers = (mesh, settings = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!(s.thickness > 0)) throw new Error('thickness must be > 0');
  if (!(s.gap >= 0)) throw new Error('gap must be >= 0');
  let top = -Infinity, bottom = Infinity;
  for (let i = 0; i < mesh.triCount; i++) {
    if (mesh.zmax[i] > top) top = mesh.zmax[i];
    if (mesh.zmin[i] < bottom) bottom = mesh.zmin[i];
  }
  const layers = [];
  for (let z0 = bottom + s.startOffset; z0 < top - EPS; z0 += s.thickness + s.gap) {
    const z1 = z0 + s.thickness;
    const cuts = sampleHeights(z0, z1, s.contour, s.samples).filter((z) => z > bottom && z < top).map((z) => sliceRegion(mesh, z, s));
    if (!cuts.length) continue;
    let region = cuts[0];
    for (const cut of cuts.slice(1)) region = s.contour === 'inner' ? G.intersect(region, cut) : G.union([...region, ...cut]);
    region = G.clean(region, s.simplify);
    region = dropSpecks(region, s.minIslandArea);
    if (!region.length) continue;
    layers.push({ index: layers.length + 1, z0, z1, region });
  }
  return layers;
};

const guideCovers = (guide, layer) =>
  (guide.zFrom == null || layer.z1 > guide.zFrom + EPS) && (guide.zTo == null || layer.z0 < guide.zTo - EPS);

/**
 * Cut guide holes into layers and check that every part is pinned.
 * guides: [{ id, x, y, diameter, zFrom?, zTo? }]
 * Returns { layers: [{ ...layer, final, hits }], rods, warnings }.
 */
export const applyGuides = (layers, guides = [], { minWall = 3 } = {}) => {
  const warnings = [];
  const rods = new Map(guides.map((g) => [g.id, { guide: g, z0: Infinity, z1: -Infinity, layers: [] }]));
  const result = layers.map((layer) => {
    const holes = [];
    const hits = [];
    for (const g of guides) {
      if (!guideCovers(g, layer)) continue;
      const r = g.diameter / 2;
      const c = [G.circle(g.x, g.y, r)];
      const cArea = Math.PI * r * r;
      const inside = G.area(G.intersect(c, layer.region));
      if (inside < cArea * 0.02) continue; // guide does not pass through this sheet
      const outside = G.area(G.difference(c, layer.region));
      if (outside > cArea * 0.02) {
        warnings.push({ level: 'warn', layer: layer.index, guide: g.id, msg: `Направляющая ${g.id} выходит за край слоя ${layer.index}` });
      } else if (G.area(G.difference([G.circle(g.x, g.y, r + minWall)], layer.region)) > 1e-3) {
        warnings.push({ level: 'info', layer: layer.index, guide: g.id, msg: `Направляющая ${g.id}: тонкая стенка (< ${minWall} мм) на слое ${layer.index}` });
      }
      holes.push(...c);
      hits.push(g.id);
      const rod = rods.get(g.id);
      rod.z0 = Math.min(rod.z0, layer.z0);
      rod.z1 = Math.max(rod.z1, layer.z1);
      rod.layers.push(layer.index);
    }
    const final = holes.length ? G.difference(layer.region, holes) : layer.region;
    return { ...layer, final, hits };
  });

  for (const layer of result) {
    const isl = G.islands(layer.final);
    isl.forEach((island, k) => {
      const pinned = guides.some((g) => layer.hits.includes(g.id) && G.containsPoint([island.outer], [g.x, g.y]));
      if (!pinned && guides.length) {
        warnings.push({ level: 'warn', layer: layer.index, msg: `Слой ${layer.index}${isl.length > 1 ? `, деталь ${k + 1}` : ''}: нет направляющей — деталь не будет зафиксирована` });
      }
    });
  }
  for (const rod of rods.values()) {
    if (!rod.layers.length) warnings.push({ level: 'warn', guide: rod.guide.id, msg: `Направляющая ${rod.guide.id} не проходит ни через один слой` });
  }
  if (!guides.length && layers.length > 1) warnings.push({ level: 'info', msg: 'Направляющие не заданы — слои нечем выравнивать. Добавьте их вручную или кнопкой «Авто».' });

  const rodList = [...rods.values()].filter((r) => r.layers.length).map((r) => ({
    id: r.guide.id, diameter: r.guide.diameter, x: r.guide.x, y: r.guide.y, z0: r.z0, z1: r.z1, length: r.z1 - r.z0, layers: r.layers,
  }));
  return { layers: result, rods: rodList, warnings };
};

const farthestPoints = (path, count) => {
  const pts = path.map((p) => [p.X / G.SCALE, p.Y / G.SCALE]);
  const step = Math.max(1, Math.floor(pts.length / 300));
  const s = pts.filter((_, i) => i % step === 0);
  let best = [s[0], s[0]], bestD = -1;
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const d = (s[i][0] - s[j][0]) ** 2 + (s[i][1] - s[j][1]) ** 2;
    if (d > bestD) { bestD = d; best = [s[i], s[j]]; }
  }
  if (count < 3) return best;
  const [a, b] = best;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let third = null, thirdD = -1;
  for (const p of s) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > thirdD) { thirdD = d; third = p; }
  }
  return thirdD > 1 ? [a, b, third] : best;
};

/**
 * Place guides automatically. Consecutive sheets are grouped into runs that
 * share a common area; each run gets `count` rods. Neighbouring runs share
 * one sheet so the whole stack stays connected.
 */
export const autoGuides = (layers, { diameter = 8, count = 2, margin = 4, idStart = 1 } = {}) => {
  const inset = layers.map((l) => {
    const isl = G.islands(l.region).sort((a, b) => G.area(G.islandPaths(b)) - G.area(G.islandPaths(a)));
    return isl.length ? G.offset(G.islandPaths(isl[0]), -(diameter / 2 + margin)) : [];
  });
  const minArea = 1;
  const guides = [];
  let id = idStart;
  const emit = (acc, s, e) => {
    const isl = G.islands(acc).sort((a, b) => G.area(G.islandPaths(b)) - G.area(G.islandPaths(a)));
    if (!isl.length) return;
    const pts = count === 1 ? [G.interiorPoint(G.islandPaths(isl[0])).point] : farthestPoints(isl[0].outer, count);
    const zFrom = s === 0 ? null : layers[s].z0;
    const zTo = e === layers.length - 1 ? null : layers[e].z1;
    for (const [x, y] of pts) guides.push({ id: id++, x: +x.toFixed(2), y: +y.toFixed(2), diameter, zFrom, zTo });
  };
  let s = 0;
  while (s < layers.length) {
    let acc = inset[s];
    let e = s;
    if (G.area(acc) < minArea) { s++; continue; }
    while (e + 1 < layers.length) {
      const next = G.intersect(acc, inset[e + 1]);
      if (G.area(next) < minArea) break;
      acc = next;
      e++;
    }
    if (e > s || layers.length === 1) emit(acc, s, e);
    if (e === layers.length - 1) break;
    s = e > s ? e : s + 1;
  }
  pinLooseIslands(layers, guides, { diameter, count, margin }, () => id++);
  return guides;
};

// Second pass: islands left without a rod (side branches, separate limbs) get
// their own rods, running up/down through every sheet that has room for them.
const pinLooseIslands = (layers, guides, { diameter, count, margin }, nextId) => {
  const clearance = diameter / 2 + margin;
  const roomy = layers.map((l) => G.offset(l.region, -clearance));
  const isPinned = (layer, island) => guides.some((g) => guideCovers(g, layer) && G.containsPoint([island.outer], [g.x, g.y]) && G.containsPoint(G.islandPaths(island), [g.x, g.y]));
  for (let li = 0; li < layers.length; li++) {
    for (const island of G.islands(layers[li].region)) {
      if (isPinned(layers[li], island)) continue;
      const room = G.offset(G.islandPaths(island), -clearance);
      const isl = G.islands(room).sort((a, b) => G.area(G.islandPaths(b)) - G.area(G.islandPaths(a)));
      if (!isl.length) continue;
      const pts = count === 1 ? [G.interiorPoint(G.islandPaths(isl[0])).point] : farthestPoints(isl[0].outer, count);
      for (const [x, y] of pts) {
        let lo = li, hi = li;
        while (lo > 0 && G.containsPoint(roomy[lo - 1], [x, y])) lo--;
        while (hi < layers.length - 1 && G.containsPoint(roomy[hi + 1], [x, y])) hi++;
        if (lo === hi) continue; // nothing to connect to
        guides.push({
          id: nextId(), x: +x.toFixed(2), y: +y.toFixed(2), diameter,
          zFrom: lo === 0 ? null : layers[lo].z0, zTo: hi === layers.length - 1 ? null : layers[hi].z1,
        });
      }
    }
  }
};

/** Split layers into individual cut parts (islands). */
export const buildParts = (layers) => {
  const parts = [];
  for (const layer of layers) {
    const isl = G.islands(layer.final || layer.region);
    isl.forEach((island, k) => {
      parts.push({
        id: isl.length > 1 ? `${layer.index}-${k + 1}` : `${layer.index}`,
        layer: layer.index,
        z0: layer.z0,
        z1: layer.z1,
        paths: G.islandPaths(island),
      });
    });
  }
  return parts;
};
