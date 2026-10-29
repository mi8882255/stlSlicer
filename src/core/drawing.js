// Turn parts into flat drawings (sheets or single layers) made of cut and
// engrave polylines in millimetres, ready for SVG / DXF / G-code writers.

import * as G from './geom.js';
import { textStrokes, textWidth } from './font.js';
import { nest } from './nest.js';

export const DEFAULT_OUTPUT = {
  kerf: 0, // tool/beam width; cut paths are offset outward by kerf/2
  label: true, // engrave part number
  labelHeight: 8,
  engraveNext: true, // engrave outline of the sheet above (gluing reference)
  sheetWidth: 600,
  sheetHeight: 400,
  margin: 5,
  spacing: 4,
  allowRotate: true,
};

const pathPts = (p) => G.fromClipPath(p);

/** Geometry of one part in model coordinates. */
export const partGeometry = (part, layerByIndex, opts) => {
  const o = { ...DEFAULT_OUTPUT, ...opts };
  const cutRegion = o.kerf ? G.offset(part.paths, o.kerf / 2) : part.paths;
  const cut = [];
  // Holes first, outer contour last, so the part does not move before it's done.
  for (const p of cutRegion) if (!G.isOuter(p)) cut.push({ points: pathPts(p), closed: true, inner: true });
  for (const p of cutRegion) if (G.isOuter(p)) cut.push({ points: pathPts(p), closed: true, inner: false });

  const engrave = [];
  if (o.engraveNext) {
    const above = layerByIndex.get(part.layer + 1);
    if (above) {
      for (const line of G.clipLinesInside(above.region, G.offset(part.paths, -0.5))) engrave.push({ points: line, closed: false });
    }
  }
  if (o.label) {
    const ip = G.interiorPoint(part.paths);
    if (ip) {
      const text = String(part.id);
      const k = textWidth(text, 1); // width per unit height
      const maxH = (2 * ip.clearance * 0.9) / Math.hypot(k, 1);
      const h = Math.min(o.labelHeight, maxH);
      if (h >= 2) for (const line of textStrokes(text, ip.point[0], ip.point[1], h)) engrave.push({ points: line, closed: false, label: true });
    }
  }
  return { id: part.id, layer: part.layer, cut, engrave };
};

const geoBounds = (geo) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of geo.cut) for (const [x, y] of e.points) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

const mapGeo = (geo, fn) => ({
  ...geo,
  cut: geo.cut.map((e) => ({ ...e, points: e.points.map(fn) })),
  engrave: geo.engrave.map((e) => ({ ...e, points: e.points.map(fn) })),
});

/** Nest all parts onto sheets. Returns { sheets: [drawing], oversize }. */
export const layoutSheets = (parts, layers, opts = {}) => {
  const o = { ...DEFAULT_OUTPUT, ...opts };
  const layerByIndex = new Map(layers.map((l) => [l.index, l]));
  const geos = new Map(parts.map((p) => [p.id, partGeometry(p, layerByIndex, o)]));
  const items = [...geos.values()].map((g) => {
    const b = geoBounds(g);
    return { key: g.id, w: b.w, h: b.h };
  });
  const { sheets, oversize } = nest(items, o);
  const drawings = sheets.map((sheet) => {
    const d = { name: `sheet-${String(sheet.index).padStart(2, '0')}`, width: sheet.width, height: sheet.height, parts: [], cut: [], engrave: [] };
    for (const pl of sheet.placed) {
      const geo = geos.get(pl.key);
      const b = geoBounds(geo);
      const placed = pl.rotated
        ? mapGeo(geo, ([x, y]) => [pl.x + (b.maxY - y), pl.y + (x - b.minX)])
        : mapGeo(geo, ([x, y]) => [pl.x + (x - b.minX), pl.y + (y - b.minY)]);
      d.parts.push({ id: geo.id, layer: geo.layer, x: pl.x, y: pl.y, w: pl.w, h: pl.h, rotated: pl.rotated });
      d.engrave.push(...placed.engrave.map((e) => ({ ...e, part: geo.id })));
      d.cut.push(...placed.cut.map((e) => ({ ...e, part: geo.id })));
    }
    return d;
  });
  return { sheets: drawings, oversize };
};

/**
 * One drawing per layer. All layers share the same origin, so the files can be
 * stacked on top of each other and guide holes line up.
 */
export const layerDrawings = (parts, layers, opts = {}) => {
  const o = { ...DEFAULT_OUTPUT, ...opts };
  const layerByIndex = new Map(layers.map((l) => [l.index, l]));
  const perLayer = layers.map((layer) => ({
    layer,
    geos: parts.filter((p) => p.layer === layer.index).map((p) => partGeometry(p, layerByIndex, o)),
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { geos } of perLayer) for (const g of geos) {
    const b = geoBounds(g);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  minX -= o.margin; minY -= o.margin; maxX += o.margin; maxY += o.margin;
  const shift = ([x, y]) => [x - minX, y - minY];
  return perLayer.map(({ layer, geos }) => {
    const moved = geos.map((g) => mapGeo(g, shift));
    return {
      name: `layer-${String(layer.index).padStart(3, '0')}`,
      layer: layer.index,
      z0: layer.z0,
      z1: layer.z1,
      origin: [minX, minY], // model XY of the drawing's (0,0)
      width: maxX - minX,
      height: maxY - minY,
      cut: moved.flatMap((g) => g.cut.map((e) => ({ ...e, part: g.id }))),
      engrave: moved.flatMap((g) => g.engrave.map((e) => ({ ...e, part: g.id }))),
    };
  });
};
