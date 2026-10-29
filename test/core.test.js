import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseStl } from '../src/core/stl.js';
import { transformMesh, bounds } from '../src/core/mesh.js';
import { prepare, buildLayers, applyGuides, autoGuides, buildParts } from '../src/core/layers.js';
import { layoutSheets, layerDrawings } from '../src/core/drawing.js';
import { toSvg } from '../src/core/export/svg.js';
import { toDxf } from '../src/core/export/dxf.js';
import { toGcode } from '../src/core/export/gcode.js';
import { runAll } from '../src/core/project.js';
import * as G from '../src/core/geom.js';

const box = fs.readFileSync(new URL('../example_stl/box.stl', import.meta.url));
const duck = fs.readFileSync(new URL('../example_stl/original_duck.stl', import.meta.url));

// Axis-aligned cube [0,s]^3 with outward winding, as ASCII STL.
const cubeStl = (s) => {
  const v = (x, y, z) => [x * s, y * s, z * s];
  const quads = [
    [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)], // bottom (-z)
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], // top
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], // -y
    [v(1, 1, 0), v(0, 1, 0), v(0, 1, 1), v(1, 1, 1)], // +y
    [v(0, 1, 0), v(0, 0, 0), v(0, 0, 1), v(0, 1, 1)], // -x
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)], // +x
  ];
  const facet = (a, b, c) => `facet normal 0 0 0\nouter loop\nvertex ${a.join(' ')}\nvertex ${b.join(' ')}\nvertex ${c.join(' ')}\nendloop\nendfacet\n`;
  return Buffer.from(`solid cube\n${quads.map(([a, b, c, d]) => facet(a, b, c) + facet(a, c, d)).join('')}endsolid cube\n`);
};

test('parses binary and ASCII STL', () => {
  assert.equal(parseStl(duck).length % 9, 0);
  assert.ok(parseStl(duck).length / 9 > 1000);
  assert.equal(parseStl(cubeStl(10)).length / 9, 12);
  assert.equal(parseStl(box).length / 9, 12);
});

test('transform puts model on the table, centred, at target height', () => {
  const t = transformMesh(parseStl(duck), { rotation: [90, 0, 0], targetHeight: 200 });
  const b = bounds(t);
  assert.ok(Math.abs(b.min[2]) < 1e-3);
  assert.ok(Math.abs(b.size[2] - 200) < 1e-3);
  assert.ok(Math.abs(b.min[0] + b.max[0]) < 1e-3);
});

test('cube slices into square sheets with gaps', () => {
  const mesh = prepare(transformMesh(parseStl(cubeStl(50))));
  const layers = buildLayers(mesh, { thickness: 6, gap: 4 });
  // sheets start at 0, 10, 20, 30, 40 (the one at 50 is above the model)
  assert.deepEqual(layers.map((l) => l.z0), [0, 10, 20, 30, 40]);
  for (const l of layers) {
    assert.equal(G.islands(l.region).length, 1);
    assert.ok(Math.abs(G.area(l.region) - 2500) < 1, `area ${G.area(l.region)}`);
  }
});

test('all contour modes produce valid regions', () => {
  const mesh = prepare(transformMesh(parseStl(duck), { targetHeight: 120 }));
  const areas = {};
  for (const contour of ['middle', 'bottom', 'top', 'outer', 'inner']) {
    const layers = buildLayers(mesh, { thickness: 10, gap: 5, contour });
    assert.ok(layers.length >= 6, contour);
    areas[contour] = layers.reduce((s, l) => s + G.area(l.region), 0);
    assert.ok(areas[contour] > 0, contour);
  }
  assert.ok(areas.outer >= areas.middle && areas.middle >= areas.inner);
});

test('guides cut holes, report rods and warn about unpinned parts', () => {
  const mesh = prepare(transformMesh(parseStl(cubeStl(50))));
  const layers = buildLayers(mesh, { thickness: 6, gap: 4 });
  const guides = [{ id: 1, x: -10, y: 0, diameter: 6 }, { id: 2, x: 10, y: 0, diameter: 6, zTo: 25 }, { id: 3, x: 24, y: 0, diameter: 6 }];
  const { layers: done, rods, warnings } = applyGuides(layers, guides);
  const hole = Math.PI * 9;
  // rod 2 stops at z=25, so the top sheet has exactly one hole less
  assert.ok(Math.abs(G.area(done[4].final) - G.area(done[0].final) - hole) < 1);
  // rod 3 sticks out of the edge and is cut as a notch (less than a full hole)
  const notch = 2500 - hole - G.area(done[4].final);
  assert.ok(notch > 0.5 && notch < hole - 0.5, `notch ${notch}`);
  const r2 = rods.find((r) => r.id === 2);
  assert.deepEqual(r2.layers, [1, 2, 3]);
  assert.equal(r2.length, 26);
  assert.ok(warnings.some((w) => w.guide === 3 && w.level === 'warn'));
  assert.ok(!warnings.some((w) => /нет направляющей/.test(w.msg)));
});

test('auto guides pin every sheet of the duck body', () => {
  const mesh = prepare(transformMesh(parseStl(duck), { targetHeight: 150 }));
  const layers = buildLayers(mesh, { thickness: 10, gap: 5 });
  const guides = autoGuides(layers, { diameter: 6, count: 2, margin: 3 });
  assert.ok(guides.length >= 2);
  const { layers: done } = applyGuides(layers, guides);
  // every sheet except possibly the very top must be crossed by a rod
  const unpinned = done.slice(0, -1).filter((l) => !l.hits.length);
  assert.deepEqual(unpinned.map((l) => l.index), []);
  // and consecutive sheets must share at least one rod, so the stack is connected
  for (let i = 1; i < done.length - 1; i++) {
    assert.ok(done[i].hits.some((id) => done[i - 1].hits.includes(id)), `sheet ${i + 1} not linked to ${i}`);
  }
});

test('nesting keeps parts inside sheets and exporters produce output', () => {
  const mesh = prepare(transformMesh(parseStl(duck), { targetHeight: 200 }));
  const raw = buildLayers(mesh, { thickness: 8, gap: 4 });
  const { layers } = applyGuides(raw, autoGuides(raw, { diameter: 6 }));
  const parts = buildParts(layers);
  const { sheets } = layoutSheets(parts, layers, { sheetWidth: 400, sheetHeight: 300, kerf: 0.2 });
  const placed = sheets.flatMap((s) => s.parts.map((p) => p.id)).sort();
  assert.deepEqual(placed, parts.map((p) => p.id).sort());
  for (const s of sheets) {
    for (const e of s.cut) for (const [x, y] of e.points) {
      assert.ok(x >= -1e-6 && y >= -1e-6 && x <= s.width + 1e-6 && y <= s.height + 1e-6);
    }
    const svg = toSvg(s);
    assert.match(svg, /<svg[^>]+width="400mm"/);
    assert.match(toDxf(s), /POLYLINE[\s\S]*EOF\n$/);
    const laser = toGcode(s);
    assert.match(laser, /^; sheet-/);
    assert.ok((laser.match(/M4 S1000/g) || []).length >= s.cut.length);
    const router = toGcode(s, { machine: 'router', cutDepth: 8.3, stepDown: 3 });
    assert.match(router, /G1 Z-8\.3 /);
    assert.match(router, /G1 Z-3 /);
  }
  // per-layer drawings share an origin so holes line up
  const ld = layerDrawings(parts, layers);
  assert.equal(new Set(ld.map((d) => d.origin.join(','))).size, 1);
});

test('runAll builds the whole file set', () => {
  const { files, result } = runAll(box, { slicing: { thickness: 3, gap: 2 }, autoGuides: true }, { formats: ['svg', 'dxf', 'gcode'], mode: 'both' });
  assert.equal(result.layers.length, 10);
  assert.ok(result.rods.length >= 2);
  const names = files.map((f) => f.name);
  assert.ok(names.includes('report.txt') && names.includes('project.json'));
  assert.ok(names.some((n) => n.startsWith('sheets/') && n.endsWith('.gcode')));
  assert.equal(names.filter((n) => n.startsWith('layers/') && n.endsWith('.svg')).length, 10);
});
