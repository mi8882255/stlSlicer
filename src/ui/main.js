import JSZip from 'jszip';
import duckUrl from '../../example_stl/original_duck.stl?url';
import { defaultProject, mergeProject, finishLayers, buildFiles, reportText, autoGuides } from '../core/project.js';
import { layoutSheets } from '../core/drawing.js';
import { toSvg } from '../core/export/svg.js';
import { toDxf } from '../core/export/dxf.js';
import { toGcode } from '../core/export/gcode.js';
import { renderPanel, el } from './panel.js';
import { createView3d } from './view3d.js';
import { createLayerView } from './layerView.js';

const $ = (s) => document.querySelector(s);
const STORAGE_KEY = 'stlSlicer.project';

const loadStored = () => {
  try { return mergeProject(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { return defaultProject(); }
};
const store = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project)); } catch { /* private mode */ } };

const state = {
  project: loadStored(),
  fileName: null,
  rawLayers: [],
  result: null,
  bounds: null,
  layerIndex: 1,
  selectedGuide: null,
  sheets: null,
  tab: 'view3d',
  exportFormats: new Set(['svg', 'gcode']),
  exportMode: 'both',
};

// ---------- worker ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let jobId = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  if (data.type === 'error') p.reject(new Error(data.message)); else p.resolve(data);
};
const call = (msg, transfer) => new Promise((resolve, reject) => {
  const id = ++jobId;
  pending.set(id, { resolve, reject });
  worker.postMessage({ ...msg, id }, transfer || []);
});

const setStatus = (t) => { $('#status').textContent = t; };
const showError = (msg) => {
  $('#warnings').innerHTML = '';
  $('#warnings').append(el('div', { class: 'error' }, msg));
};

// ---------- views ----------
const view3d = createView3d($('#three'));
const layerView = createLayerView($('#layerCanvas'), {
  onAdd: (x, y) => {
    if (!state.result) return;
    const id = Math.max(0, ...state.project.guides.map((g) => g.id)) + 1;
    state.project.guides.push({ id, x, y, diameter: state.project.guide.diameter, zFrom: null, zTo: null });
    state.selectedGuide = id;
    refreshGuides();
  },
  onMove: () => refreshGuides(),
  onDelete: (id) => {
    state.project.guides = state.project.guides.filter((g) => g.id !== id);
    refreshGuides();
  },
  onSelect: (id) => { state.selectedGuide = id; renderGuideTable(); },
});

// ---------- pipeline ----------
let sliceTimer = null;
const scheduleSlice = () => {
  clearTimeout(sliceTimer);
  sliceTimer = setTimeout(reslice, 250);
};

let sliceSeq = 0;
let refitNext = false;
const reslice = async () => {
  if (!state.fileName) return;
  const seq = ++sliceSeq;
  setStatus('Нарезка…');
  const t0 = performance.now();
  try {
    const res = await call({ type: 'slice', transform: state.project.transform, slicing: state.project.slicing });
    if (seq !== sliceSeq) return;
    state.rawLayers = res.layers;
    state.bounds = res.bounds;
    view3d.setModel(res.tris, res.bounds);
    layerView.set({ bounds: res.bounds });
    if (refitNext) { view3d.refit(); layerView.refit(); refitNext = false; }
    const [w, d, h] = res.bounds.size;
    setStatus(`${state.fileName}: ${w.toFixed(0)}×${d.toFixed(0)}×${h.toFixed(0)} мм · ${res.layers.length} слоёв · ${Math.round(performance.now() - t0)} мс`);
    refreshGuides();
  } catch (err) {
    setStatus('');
    showError(`Ошибка: ${err.message}`);
  }
};

const refreshGuides = () => {
  if (!state.rawLayers.length) {
    state.result = null;
    renderAll();
    return;
  }
  state.result = finishLayers(state.rawLayers, state.project);
  state.sheets = null;
  state.layerIndex = Math.min(Math.max(1, state.layerIndex), state.result.layers.length);
  store();
  renderAll();
};

// ---------- rendering ----------
const renderWarnings = () => {
  const box = $('#warnings');
  box.innerHTML = '';
  if (!state.result) return;
  for (const w of state.result.warnings) {
    const row = el('div', { class: w.level, title: w.layer ? 'Показать слой' : '' }, w.msg);
    if (w.layer) row.style.cursor = 'pointer';
    row.addEventListener('click', () => { if (w.layer) { state.layerIndex = w.layer; selectTab('layer'); renderLayer(); } });
    box.append(row);
  }
};

const renderLayer = () => {
  const r = state.result;
  const slider = $('#layerSlider');
  if (!r || !r.layers.length) {
    layerView.set({ layer: null, below: null, above: null, guides: [] });
    $('#layerInfo').textContent = '';
    return;
  }
  slider.max = r.layers.length;
  slider.value = state.layerIndex;
  const i = state.layerIndex - 1;
  const layer = r.layers[i];
  $('#layerInfo').textContent = `Слой ${layer.index} из ${r.layers.length} · Z ${layer.z0.toFixed(1)}…${layer.z1.toFixed(1)} мм · направляющие: ${layer.hits.join(', ') || '—'}`;
  layerView.set({ layer, below: r.layers[i - 1] || null, above: r.layers[i + 1] || null, guides: state.project.guides, selected: state.selectedGuide });
  view3d.setHighlight(state.tab === 'layer' ? layer.index : null);
};

const render3d = () => {
  if (!state.result) { view3d.setLayers([], []); return; }
  view3d.setLayers(state.result.layers, state.result.rods);
  view3d.setHighlight(state.tab === 'layer' ? state.layerIndex : null);
};

const download = (name, content, type = 'application/octet-stream') => {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const baseName = () => (state.fileName || 'model').replace(/\.stl$/i, '');

const gcodeOpts = () => {
  const o = { ...state.project.gcode };
  if (o.cutDepth == null) o.cutDepth = state.project.slicing.thickness + 0.3;
  return o;
};

const renderSheets = () => {
  const list = $('#sheetList');
  list.innerHTML = '';
  if (!state.result) { list.append(el('div', { class: 'empty' }, 'Загрузите модель')); return; }
  if (!state.sheets) state.sheets = layoutSheets(state.result.parts, state.result.layers, state.project.output);
  const { sheets, oversize } = state.sheets;
  if (oversize.length) list.append(el('div', { class: 'note', style: 'width:100%' }, `Не помещаются на лист (вынесены на отдельные листы увеличенного размера): ${oversize.join(', ')}`));
  for (const d of sheets) {
    const svg = toSvg(d, { strokeWidth: Math.max(d.width, d.height) / 600 });
    const img = el('img', { src: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), alt: d.name });
    const links = el('span', {},
      el('a', { href: '#', onclick: (e) => { e.preventDefault(); download(`${baseName()}-${d.name}.svg`, toSvg(d), 'image/svg+xml'); } }, 'SVG'), ' · ',
      el('a', { href: '#', onclick: (e) => { e.preventDefault(); download(`${baseName()}-${d.name}.dxf`, toDxf(d)); } }, 'DXF'), ' · ',
      el('a', { href: '#', onclick: (e) => { e.preventDefault(); download(`${baseName()}-${d.name}.gcode`, toGcode(d, gcodeOpts())); } }, 'G-code'));
    list.append(el('div', { class: 'sheet' }, img, el('div', { class: 'cap' }, `${d.name} · ${d.width}×${d.height} мм · детали: ${d.parts.map((p) => p.id).join(', ')} · `, links)));
  }
};

const renderReport = () => {
  if (!state.result) { $('#reportText').textContent = 'Загрузите модель'; return; }
  if (!state.sheets) state.sheets = layoutSheets(state.result.parts, state.result.layers, state.project.output);
  $('#reportText').textContent = reportText(state.result, state.project, state.sheets.sheets.length);
};

const renderGuideTable = () => {
  const box = document.querySelector('#guideTable');
  if (!box) return;
  box.innerHTML = '';
  const guides = state.project.guides;
  if (!guides.length) { box.append(el('div', { class: 'note' }, 'Нет направляющих. Кликните по слою на вкладке «Слой» или нажмите «Авто».')); return; }
  const rods = new Map((state.result?.rods || []).map((r) => [r.id, r]));
  const num = (g, key, step = 0.5) => el('input', {
    type: 'number', step, value: g[key] ?? '', placeholder: key.startsWith('z') ? 'все' : '',
    onchange: (e) => { g[key] = e.target.value === '' ? null : parseFloat(e.target.value); refreshGuides(); },
  });
  const rows = guides.map((g) => {
    const rod = rods.get(g.id);
    return el('tr', { class: g.id === state.selectedGuide ? 'selected' : '', onclick: () => { state.selectedGuide = g.id; renderLayer(); } },
      el('td', { title: rod ? `длина ${rod.length.toFixed(1)} мм, слои ${rod.layers[0]}…${rod.layers[rod.layers.length - 1]}` : 'не проходит через слои' }, `#${g.id}${rod ? '' : ' ⚠'}`),
      el('td', {}, num(g, 'x')), el('td', {}, num(g, 'y')), el('td', {}, num(g, 'diameter')),
      el('td', {}, num(g, 'zFrom', 1)), el('td', {}, num(g, 'zTo', 1)),
      el('td', {}, el('button', { class: 'btn small', title: 'Удалить', onclick: (e) => { e.stopPropagation(); state.project.guides = guides.filter((x) => x !== g); refreshGuides(); } }, '×')));
  });
  box.append(el('table', { class: 'guides' },
    el('tr', {}, ['', 'X', 'Y', 'Ø', 'Z от', 'Z до', ''].map((h) => el('th', {}, h))), rows));
};

const exportZip = async () => {
  if (!state.result) return;
  setStatus('Экспорт…');
  const files = buildFiles(state.result, state.project, { formats: [...state.exportFormats], mode: state.exportMode });
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  download(`${baseName()}-slices.zip`, await zip.generateAsync({ type: 'blob' }));
  setStatus(`Готово: ${files.length} файлов`);
};

const panelExtras = {
  model: (box) => {
    box.append(el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: () => rotate(0) }, '↻ X 90°'),
      el('button', { class: 'btn small', onclick: () => rotate(1) }, '↻ Y 90°'),
      el('button', { class: 'btn small', onclick: () => rotate(2) }, '↻ Z 90°'),
      el('button', { class: 'btn small', onclick: () => { state.project.transform.rotation = [0, 0, 0]; changed('transform.rotation'); } }, 'Сброс')));
    box.append(el('div', { class: 'note' }, 'Слои режутся перпендикулярно оси Z. Поверните модель так, чтобы «верх» был сверху.'));
  },
  guides: (box) => {
    box.append(el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: () => {
        if (!state.rawLayers.length) return;
        state.project.guides = autoGuides(state.rawLayers, state.project.guide);
        refreshGuides();
      } }, 'Авто'),
      el('button', { class: 'btn small', onclick: () => {
        const d = state.project.guide.diameter;
        state.project.guides.forEach((g) => { g.diameter = d; });
        refreshGuides();
      } }, 'Ø всем'),
      el('button', { class: 'btn small', onclick: () => { state.project.guides = []; refreshGuides(); } }, 'Очистить')));
    box.append(el('div', { id: 'guideTable' }));
    box.append(el('div', { class: 'note' }, 'Стержни проходят сквозь листы и держат их соосно; зазоры между листами задаются проставками. «Z от/до» ограничивают стержень по высоте (пусто — на всю высоту).'));
  },
  export: (root) => {
    const fmt = (key, label) => el('label', {}, el('input', { type: 'checkbox', checked: state.exportFormats.has(key), onchange: (e) => { if (e.target.checked) state.exportFormats.add(key); else state.exportFormats.delete(key); } }), ` ${label}`);
    root.append(el('details', { open: true, 'data-title': 'export' }, el('summary', {}, 'Экспорт'),
      el('div', { class: 'row' }, fmt('svg', 'SVG'), fmt('dxf', 'DXF'), fmt('gcode', 'G-code')),
      el('div', { class: 'field' }, el('label', {}, 'Файлы'),
        el('select', { onchange: (e) => { state.exportMode = e.target.value; } },
          [['both', 'листы + слои'], ['sheets', 'раскрой на листы'], ['layers', 'по слою на файл']].map(([v, t]) => el('option', { value: v, selected: v === state.exportMode }, t)))),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: exportZip }, 'Скачать ZIP')),
      el('div', { class: 'note' }, 'Красный — рез, синий — гравировка (номер детали и контур следующего слоя). Файлы «по слою» имеют общий ноль — отверстия совпадают.')));
  },
};

const rotate = (axis) => {
  const r = state.project.transform.rotation;
  r[axis] = ((r[axis] || 0) + 90) % 360;
  changed('transform.rotation');
};

const changed = (path) => {
  store();
  if (path.startsWith('transform') || path.startsWith('slicing')) {
    if (path.startsWith('transform')) refitNext = true;
    scheduleSlice();
  } else if (path.startsWith('guide')) refreshGuides();
  else if (path.startsWith('output')) { state.sheets = null; renderTab(); }
  renderPanelNow();
};

const renderPanelNow = () => {
  renderPanel($('#panel'), state.project, { onChange: changed, extra: panelExtras });
  renderGuideTable();
};

const renderTab = () => {
  if (state.tab === 'sheets') renderSheets();
  if (state.tab === 'report') renderReport();
  if (state.tab === 'layer') renderLayer();
};

const renderAll = () => {
  render3d();
  renderLayer();
  renderWarnings();
  renderGuideTable();
  renderTab();
};

const selectTab = (tab) => {
  state.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === tab));
  renderTab();
  view3d.setHighlight(tab === 'layer' ? state.layerIndex : null);
};

// ---------- loading ----------
const loadBytes = async (name, buffer) => {
  try {
    setStatus('Загрузка…');
    const res = await call({ type: 'load', bytes: buffer }, [buffer]);
    state.fileName = name;
    setStatus(`${name}: ${res.triangles} треугольников`);
    refitNext = true;
    await reslice();
  } catch (err) {
    showError(`Не удалось прочитать STL: ${err.message}`);
  }
};

const loadFile = async (file) => loadBytes(file.name, await file.arrayBuffer());

$('#file').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
$('#demo').addEventListener('click', async () => {
  const buf = await (await fetch(duckUrl)).arrayBuffer();
  loadBytes('original_duck.stl', buf);
});
$('#saveProject').addEventListener('click', () => download(`${baseName()}-project.json`, JSON.stringify(state.project, null, 2), 'application/json'));
$('#projectFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    state.project = mergeProject(JSON.parse(await f.text()));
    store();
    renderPanelNow();
    scheduleSlice();
  } catch (err) { showError(`Неверный файл проекта: ${err.message}`); }
});

// drag & drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  const f = [...e.dataTransfer.files].find((x) => /\.stl$/i.test(x.name)) || e.dataTransfer.files[0];
  if (f) loadFile(f);
});

// tabs and layer controls
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$('#layerSlider').addEventListener('input', (e) => { state.layerIndex = +e.target.value; renderLayer(); });
$('#layerPrev').addEventListener('click', () => { state.layerIndex = Math.max(1, state.layerIndex - 1); renderLayer(); });
$('#layerNext').addEventListener('click', () => { state.layerIndex = Math.min(state.result?.layers.length || 1, state.layerIndex + 1); renderLayer(); });
window.addEventListener('keydown', (e) => {
  if (state.tab !== 'layer' || e.target.closest('input, select')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') $('#layerPrev').click();
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') $('#layerNext').click();
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedGuide) {
    state.project.guides = state.project.guides.filter((g) => g.id !== state.selectedGuide);
    state.selectedGuide = null;
    refreshGuides();
  }
});

const show3d = () => view3d.show({ model: $('#showModel').checked, layers: $('#showLayers').checked, rods: $('#showRods').checked });
['#showModel', '#showLayers', '#showRods'].forEach((s) => $(s).addEventListener('change', show3d));
$('#explode').addEventListener('input', (e) => view3d.setExplode(+e.target.value));

renderPanelNow();
renderAll();
$('#sheetList').append(el('div', { class: 'empty' }, 'Загрузите модель'));
setStatus('Откройте STL или перетащите файл в окно');
