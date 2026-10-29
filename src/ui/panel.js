// Settings panel generated from a schema. Each field maps to a dotted path in the project.

export const SECTIONS = [
  {
    title: 'Модель', open: true, id: 'model',
    fields: [
      { path: 'transform.targetHeight', label: 'Высота скульптуры, мм', type: 'number', step: 1, min: 0, nullable: true, note: 'пусто = масштаб' },
      { path: 'transform.scale', label: 'Масштаб', type: 'number', step: 0.1, min: 0.001, show: (p) => !p.transform.targetHeight },
      { path: 'transform.rotation.0', label: 'Поворот X, °', type: 'number', step: 90 },
      { path: 'transform.rotation.1', label: 'Поворот Y, °', type: 'number', step: 90 },
      { path: 'transform.rotation.2', label: 'Поворот Z, °', type: 'number', step: 15 },
    ],
  },
  {
    title: 'Слои', open: true,
    fields: [
      { path: 'slicing.thickness', label: 'Толщина листа, мм', type: 'number', step: 0.5, min: 0.1 },
      { path: 'slicing.gap', label: 'Зазор между листами, мм', type: 'number', step: 0.5, min: 0 },
      { path: 'slicing.startOffset', label: 'Смещение первого слоя, мм', type: 'number', step: 0.5 },
      {
        path: 'slicing.contour', label: 'Контур листа', type: 'select',
        options: [
          ['middle', 'по середине листа'],
          ['outer', 'внешний (с припуском)'],
          ['inner', 'внутренний'],
          ['bottom', 'по низу листа'],
          ['top', 'по верху листа'],
        ],
      },
      { path: 'slicing.samples', label: 'Сечений на лист', type: 'number', step: 1, min: 2, show: (p) => ['outer', 'inner'].includes(p.slicing.contour) },
      { path: 'slicing.minIslandArea', label: 'Мин. площадь детали, мм²', type: 'number', step: 1, min: 0 },
      { path: 'slicing.simplify', label: 'Упрощение контура, мм', type: 'number', step: 0.01, min: 0 },
      { path: 'slicing.evenOdd', label: 'Even-odd (битые нормали)', type: 'checkbox' },
    ],
  },
  {
    title: 'Направляющие', open: true, id: 'guides',
    fields: [
      { path: 'guide.diameter', label: 'Диаметр стержня, мм', type: 'number', step: 0.5, min: 0.5 },
      { path: 'guide.count', label: 'Стержней на группу (авто)', type: 'number', step: 1, min: 1, max: 3 },
      { path: 'guide.margin', label: 'Отступ от края (авто), мм', type: 'number', step: 0.5, min: 0 },
      { path: 'guide.minWall', label: 'Мин. стенка, мм', type: 'number', step: 0.5, min: 0 },
      { path: 'guide.protrude', label: 'Выпуск стержня с торцов, мм', type: 'number', step: 1, min: 0 },
    ],
  },
  {
    title: 'Раскрой и разметка', open: false,
    fields: [
      { path: 'output.sheetWidth', label: 'Ширина листа, мм', type: 'number', step: 10, min: 10 },
      { path: 'output.sheetHeight', label: 'Высота листа, мм', type: 'number', step: 10, min: 10 },
      { path: 'output.margin', label: 'Поле листа, мм', type: 'number', step: 1, min: 0 },
      { path: 'output.spacing', label: 'Между деталями, мм', type: 'number', step: 1, min: 0 },
      { path: 'output.allowRotate', label: 'Поворачивать детали на 90°', type: 'checkbox' },
      { path: 'output.kerf', label: 'Компенсация реза, мм', type: 'number', step: 0.05, min: 0, note: 'ширина луча / диаметр фрезы' },
      { path: 'output.label', label: 'Гравировать номер детали', type: 'checkbox' },
      { path: 'output.labelHeight', label: 'Высота цифр, мм', type: 'number', step: 1, min: 2, show: (p) => p.output.label },
      { path: 'output.engraveNext', label: 'Гравировать контур следующего слоя', type: 'checkbox' },
    ],
  },
  {
    title: 'G-code', open: false,
    fields: [
      { path: 'gcode.machine', label: 'Станок', type: 'select', options: [['laser', 'Лазер (GRBL)'], ['router', 'Фрезер (CNC)']] },
      { path: 'gcode.feed', label: 'Подача реза, мм/мин', type: 'number', step: 50, min: 1 },
      { path: 'gcode.power', label: 'Мощность (S)', type: 'number', step: 10, min: 0, show: (p) => p.gcode.machine === 'laser' },
      { path: 'gcode.maxPower', label: 'Макс. S ($30)', type: 'number', step: 10, min: 1, show: (p) => p.gcode.machine === 'laser' },
      { path: 'gcode.laserMode', label: 'Режим лазера', type: 'select', options: [['M4', 'M4 (динамический)'], ['M3', 'M3 (постоянный)']], show: (p) => p.gcode.machine === 'laser' },
      { path: 'gcode.passes', label: 'Проходов', type: 'number', step: 1, min: 1, show: (p) => p.gcode.machine === 'laser' },
      { path: 'gcode.engrave', label: 'Гравировка', type: 'checkbox' },
      { path: 'gcode.engravePower', label: 'Мощность гравировки', type: 'number', step: 10, min: 0, show: (p) => p.gcode.machine === 'laser' && p.gcode.engrave },
      { path: 'gcode.engraveFeed', label: 'Подача гравировки', type: 'number', step: 50, min: 1, show: (p) => p.gcode.machine === 'laser' && p.gcode.engrave },
      { path: 'gcode.spindle', label: 'Обороты шпинделя', type: 'number', step: 1000, min: 0, show: (p) => p.gcode.machine === 'router' },
      { path: 'gcode.plungeFeed', label: 'Подача врезания', type: 'number', step: 50, min: 1, show: (p) => p.gcode.machine === 'router' },
      { path: 'gcode.stepDown', label: 'Шаг по Z, мм', type: 'number', step: 0.5, min: 0.1, show: (p) => p.gcode.machine === 'router' },
      { path: 'gcode.cutDepth', label: 'Глубина реза, мм', type: 'number', step: 0.1, min: 0, nullable: true, note: 'пусто = толщина + 0.3', show: (p) => p.gcode.machine === 'router' },
      { path: 'gcode.safeZ', label: 'Безопасная Z, мм', type: 'number', step: 1, show: (p) => p.gcode.machine === 'router' },
      { path: 'gcode.engraveDepth', label: 'Глубина гравировки, мм', type: 'number', step: 0.1, min: 0, show: (p) => p.gcode.machine === 'router' && p.gcode.engrave },
    ],
  },
];

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export const setPath = (obj, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
};

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
};
export { el };

/**
 * Render the panel. hooks: { onChange(path), extra: { [sectionId]: (container) => void } }
 */
export const renderPanel = (root, project, hooks) => {
  const openState = new Map([...root.querySelectorAll('details')].map((d) => [d.dataset.title, d.open]));
  root.innerHTML = '';
  for (const sec of SECTIONS) {
    const details = el('details', { 'data-title': sec.title, open: openState.has(sec.title) ? openState.get(sec.title) : sec.open }, el('summary', {}, sec.title));
    for (const f of sec.fields) {
      if (f.show && !f.show(project)) continue;
      const value = getPath(project, f.path);
      const id = `f-${f.path.replace(/\./g, '-')}`;
      let input;
      const commit = () => {
        let v;
        if (f.type === 'checkbox') v = input.checked;
        else if (f.type === 'number') {
          if (input.value === '' && f.nullable) v = null;
          else {
            v = parseFloat(input.value);
            if (!Number.isFinite(v)) return;
            if (f.min != null) v = Math.max(f.min, v);
            if (f.max != null) v = Math.min(f.max, v);
          }
        } else v = input.value;
        setPath(project, f.path, v);
        hooks.onChange(f.path);
      };
      if (f.type === 'select') {
        input = el('select', { id, onchange: commit }, f.options.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
      } else if (f.type === 'checkbox') {
        input = el('input', { id, type: 'checkbox', checked: !!value, onchange: commit });
      } else {
        input = el('input', { id, type: 'number', step: f.step, min: f.min, max: f.max, value: value ?? '', placeholder: f.note || '', onchange: commit });
      }
      details.append(el('div', { class: 'field' }, el('label', { for: id, title: f.note || '' }, f.label), input));
    }
    if (sec.id && hooks.extra?.[sec.id]) hooks.extra[sec.id](details);
    root.append(details);
  }
  if (hooks.extra?.export) hooks.extra.export(root);
};
