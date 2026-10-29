// Drawing -> G-code for a laser (GRBL-style M3/M4 + S) or a CNC router (Z steps).
// Coordinates in mm, origin at the sheet's lower-left corner, Z=0 = material top.

export const DEFAULT_GCODE = {
  machine: 'laser', // laser | router
  feed: 1200, // cutting feed, mm/min
  // laser
  power: 1000, // S value for cutting
  maxPower: 1000, // S value that means 100% (GRBL $30)
  laserMode: 'M4', // M4 = dynamic power (GRBL laser mode), M3 = constant
  passes: 1,
  engravePower: 300,
  engraveFeed: 2000,
  // router
  spindle: 18000,
  safeZ: 5,
  cutDepth: null, // total depth; null = sheet thickness + 0.3
  stepDown: 3,
  plungeFeed: 300,
  engraveDepth: 0.5,
  engrave: true,
};

const f = (v) => (+v.toFixed(3)).toString();
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// Rotate a closed loop so it starts at the vertex nearest to `pos`.
const startNear = (e, pos) => {
  if (!e.closed) {
    return dist2(e.points[e.points.length - 1], pos) < dist2(e.points[0], pos) ? [...e.points].reverse() : e.points;
  }
  let best = 0, bd = Infinity;
  e.points.forEach((p, i) => { const d = dist2(p, pos); if (d < bd) { bd = d; best = i; } });
  const pts = [...e.points.slice(best), ...e.points.slice(0, best)];
  pts.push(pts[0]);
  return pts;
};

// Group operations by part and visit parts nearest-first; inside a part keep
// the order engrave -> holes -> outer contour.
const orderJobs = (drawing, withEngrave) => {
  const byPart = new Map();
  const add = (e, kind) => {
    const key = e.part ?? '_';
    if (!byPart.has(key)) byPart.set(key, []);
    byPart.get(key).push({ e, kind });
  };
  if (withEngrave) drawing.engrave.forEach((e) => add(e, 'engrave'));
  drawing.cut.forEach((e) => add(e, 'cut'));
  const groups = [...byPart.values()];
  const centre = (g) => g[g.length - 1].e.points[0];
  const ordered = [];
  let pos = [0, 0];
  while (groups.length) {
    let bi = 0, bd = Infinity;
    groups.forEach((g, i) => { const d = dist2(centre(g), pos); if (d < bd) { bd = d; bi = i; } });
    const [g] = groups.splice(bi, 1);
    for (const job of g) {
      const pts = startNear(job.e, pos);
      ordered.push({ ...job, pts });
      pos = pts[pts.length - 1];
    }
  }
  return ordered;
};

const laser = (drawing, o) => {
  const out = [];
  for (const job of orderJobs(drawing, o.engrave)) {
    const isCut = job.kind === 'cut';
    const s = Math.round(Math.min(isCut ? o.power : o.engravePower, o.maxPower));
    const feed = isCut ? o.feed : o.engraveFeed;
    const passes = isCut ? Math.max(1, o.passes | 0) : 1;
    out.push(`; ${job.kind} part ${job.e.part ?? ''}`);
    out.push(`G0 X${f(job.pts[0][0])} Y${f(job.pts[0][1])}`);
    for (let p = 0; p < passes; p++) {
      out.push(`${o.laserMode} S${s}`);
      for (const [x, y] of job.pts.slice(1)) out.push(`G1 X${f(x)} Y${f(y)} F${feed}`);
      out.push('M5');
      if (p < passes - 1) out.push(`G0 X${f(job.pts[0][0])} Y${f(job.pts[0][1])}`);
    }
  }
  return out;
};

const router = (drawing, o) => {
  const out = [`M3 S${o.spindle}`, `G0 Z${f(o.safeZ)}`];
  for (const job of orderJobs(drawing, o.engrave)) {
    const isCut = job.kind === 'cut';
    const total = isCut ? o.cutDepth : o.engraveDepth;
    const step = Math.max(0.1, isCut ? o.stepDown : total);
    const depths = [];
    for (let d = Math.min(step, total); d < total - 1e-6; d += step) depths.push(d);
    depths.push(total);
    out.push(`; ${job.kind} part ${job.e.part ?? ''}`);
    out.push(`G0 X${f(job.pts[0][0])} Y${f(job.pts[0][1])}`);
    for (const d of depths) {
      out.push(`G1 Z${f(-d)} F${o.plungeFeed}`);
      for (const [x, y] of job.pts.slice(1)) out.push(`G1 X${f(x)} Y${f(y)} F${o.feed}`);
      if (!job.e.closed && d !== total) {
        // open engraving line: go back up and return to the start for the next depth
        out.push(`G0 Z${f(o.safeZ)}`, `G0 X${f(job.pts[0][0])} Y${f(job.pts[0][1])}`);
      }
    }
    out.push(`G0 Z${f(o.safeZ)}`);
  }
  out.push('M5');
  return out;
};

export const toGcode = (drawing, opts = {}) => {
  const o = { ...DEFAULT_GCODE, ...opts };
  const header = [
    `; ${drawing.name}  ${f(drawing.width)} x ${f(drawing.height)} mm`,
    `; machine: ${o.machine}; origin = lower-left corner of the sheet${o.machine === 'router' ? ', Z0 = material top' : ''}`,
    'G21 ; mm',
    'G90 ; absolute',
    'G17',
    'M5',
  ];
  const body = o.machine === 'router' ? router(drawing, o) : laser(drawing, o);
  return [...header, ...body, 'G0 X0 Y0', 'M2', ''].join('\n');
};
