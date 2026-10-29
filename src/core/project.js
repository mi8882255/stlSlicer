// High-level pipeline shared by the web UI and the CLI.
//   STL bytes -> transformed mesh -> sheets -> guides -> parts -> drawings -> files

import { parseStl } from './stl.js';
import { transformMesh, bounds } from './mesh.js';
import { prepare, buildLayers, applyGuides, autoGuides, buildParts, DEFAULT_SETTINGS } from './layers.js';
import { layoutSheets, layerDrawings, DEFAULT_OUTPUT } from './drawing.js';
import { toSvg } from './export/svg.js';
import { toDxf } from './export/dxf.js';
import { toGcode, DEFAULT_GCODE } from './export/gcode.js';
import * as G from './geom.js';

export { parseStl, DEFAULT_SETTINGS, DEFAULT_OUTPUT, DEFAULT_GCODE, autoGuides };

export const DEFAULT_TRANSFORM = { rotation: [0, 0, 0], scale: 1, targetHeight: null };
export const DEFAULT_GUIDE = { diameter: 8, count: 2, margin: 4, minWall: 3, protrude: 0 };

export const defaultProject = () => ({
  version: 1,
  transform: { ...DEFAULT_TRANSFORM },
  slicing: { ...DEFAULT_SETTINGS },
  guide: { ...DEFAULT_GUIDE },
  guides: [],
  output: { ...DEFAULT_OUTPUT },
  gcode: { ...DEFAULT_GCODE },
});

export const mergeProject = (p = {}) => {
  const d = defaultProject();
  return {
    ...d,
    ...p,
    transform: { ...d.transform, ...p.transform },
    slicing: { ...d.slicing, ...p.slicing },
    guide: { ...d.guide, ...p.guide },
    guides: p.guides || [],
    output: { ...d.output, ...p.output },
    gcode: { ...d.gcode, ...p.gcode },
  };
};

/** Step 1: transformed triangles + prepared mesh. */
export const loadModel = (rawTris, transform) => {
  const tris = transformMesh(rawTris, transform);
  return { tris, mesh: prepare(tris), bounds: bounds(tris) };
};

/** Step 2: sheets (heavy, depends only on geometry + slicing settings). */
export const sliceModel = (model, slicing) => buildLayers(model.mesh, slicing);

/** Step 3: guides, parts and warnings (cheap). */
export const finishLayers = (layers, project) => {
  const { layers: done, rods, warnings } = applyGuides(layers, project.guides, project.guide);
  const parts = buildParts(done);
  for (const r of rods) r.length += 2 * (project.guide.protrude || 0);
  return { layers: done, rods, warnings, parts };
};

export const summary = (result, project) => {
  const { layers, parts, rods } = result;
  const area = layers.reduce((s, l) => s + G.area(l.final), 0);
  const top = layers.length ? layers[layers.length - 1].z1 : 0;
  return {
    sheets: layers.length,
    parts: parts.length,
    height: top - (layers[0]?.z0 || 0),
    materialArea: area, // mm² of sheet material actually used
    gapHeight: project.slicing.gap,
    rods,
  };
};

export const reportText = (result, project, sheetsCount) => {
  const s = summary(result, project);
  const lines = [
    `Слоёв (листов): ${s.sheets}, деталей: ${s.parts}`,
    `Толщина листа: ${project.slicing.thickness} мм, зазор: ${project.slicing.gap} мм, высота стопки: ${s.height.toFixed(1)} мм`,
    `Площадь материала (нетто): ${(s.materialArea / 1e6).toFixed(3)} м²`,
    sheetsCount != null ? `Листов раскроя ${project.output.sheetWidth}×${project.output.sheetHeight}: ${sheetsCount}` : '',
    '',
    'Направляющие (стержни):',
    ...s.rods.map((r) => `  #${r.id}: Ø${r.diameter} мм, X=${r.x} Y=${r.y}, длина ${r.length.toFixed(1)} мм, слои ${r.layers[0]}…${r.layers[r.layers.length - 1]}`),
    s.rods.length ? `  Проставки между листами: высота ${project.slicing.gap} мм` : '  нет',
    '',
    'Слои:',
    ...result.layers.map((l) => `  ${String(l.index).padStart(3)}: Z ${l.z0.toFixed(1)}…${l.z1.toFixed(1)} мм, направляющие: ${l.hits.join(', ') || '—'}`),
    '',
    'Предупреждения:',
    ...(result.warnings.length ? result.warnings.map((w) => `  [${w.level}] ${w.msg}`) : ['  нет']),
  ];
  return lines.filter((l, i) => l !== '' || i > 0).join('\n') + '\n';
};

/**
 * Build output files. formats: subset of ['svg', 'dxf', 'gcode'].
 * mode: 'sheets' (nested onto sheets) | 'layers' (one file per layer, common origin) | 'both'.
 */
export const buildFiles = (result, project, { formats = ['svg'], mode = 'sheets' } = {}) => {
  const files = [];
  const drawings = [];
  let sheetsCount = null;
  if (mode === 'sheets' || mode === 'both') {
    const { sheets } = layoutSheets(result.parts, result.layers, project.output);
    sheetsCount = sheets.length;
    drawings.push(...sheets.map((d) => ({ dir: 'sheets', d })));
  }
  if (mode === 'layers' || mode === 'both') {
    drawings.push(...layerDrawings(result.parts, result.layers, project.output).map((d) => ({ dir: 'layers', d })));
  }
  const gcodeOpts = { ...project.gcode };
  if (gcodeOpts.cutDepth == null) gcodeOpts.cutDepth = project.slicing.thickness + 0.3;
  for (const { dir, d } of drawings) {
    if (formats.includes('svg')) files.push({ name: `${dir}/${d.name}.svg`, content: toSvg(d) });
    if (formats.includes('dxf')) files.push({ name: `${dir}/${d.name}.dxf`, content: toDxf(d) });
    if (formats.includes('gcode')) files.push({ name: `${dir}/${d.name}.gcode`, content: toGcode(d, gcodeOpts) });
  }
  files.push({ name: 'report.txt', content: reportText(result, project, sheetsCount) });
  files.push({ name: 'project.json', content: JSON.stringify(project, null, 2) });
  return files;
};

export const runAll = (stlBytes, projectIn = {}, exportOpts = {}) => {
  const project = mergeProject(projectIn);
  const model = loadModel(parseStl(stlBytes), project.transform);
  const raw = sliceModel(model, project.slicing);
  if (project.autoGuides || (exportOpts.autoGuides && !project.guides.length)) {
    project.guides = autoGuides(raw, project.guide);
  }
  const result = finishLayers(raw, project);
  return { project, model, result, files: buildFiles(result, project, exportOpts) };
};
