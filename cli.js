#!/usr/bin/env node
// Command line front-end: node cli.js model.stl [options]
import fs from 'node:fs';
import path from 'node:path';
import { runAll, mergeProject } from './src/core/project.js';

const HELP = `Usage: node cli.js <model.stl> [options]

  -o, --out <dir>          output directory (default: ./out)
  -p, --project <file>     project JSON (settings + guides) saved from the web UI
  -t, --thickness <mm>     sheet thickness (default 10)
  -g, --gap <mm>           gap between sheets (default 5)
      --contour <mode>     middle | bottom | top | outer | inner (default middle)
      --height <mm>        scale model to this height
      --scale <k>          scale factor
      --rotate <x,y,z>     rotation in degrees, e.g. 90,0,0
  -f, --format <list>      svg,dxf,gcode (default svg)
      --mode <m>           sheets | layers | both (default both)
      --sheet <WxH>        sheet size for nesting, e.g. 600x400
      --kerf <mm>          beam / tool width compensation
      --machine <m>        laser | router (G-code flavour)
      --auto-guides [n]    place n guide rods automatically (default 2)
      --guide-d <mm>       guide rod diameter (default 8)
      --guide <x,y[,d]>    add a guide rod manually (repeatable)
      --no-label           do not engrave part numbers
      --no-next            do not engrave next-layer outline
`;

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}

let input = null;
const opt = { out: 'out', formats: ['svg'], mode: 'both', guides: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  switch (a) {
    case '-o': case '--out': opt.out = next(); break;
    case '-p': case '--project': opt.project = next(); break;
    case '-t': case '--thickness': opt.thickness = +next(); break;
    case '-g': case '--gap': opt.gap = +next(); break;
    case '--contour': opt.contour = next(); break;
    case '--height': opt.height = +next(); break;
    case '--scale': opt.scale = +next(); break;
    case '--rotate': opt.rotate = next().split(',').map(Number); break;
    case '-f': case '--format': opt.formats = next().split(','); break;
    case '--mode': opt.mode = next(); break;
    case '--sheet': opt.sheet = next().split(/x/i).map(Number); break;
    case '--kerf': opt.kerf = +next(); break;
    case '--machine': opt.machine = next(); break;
    case '--auto-guides': opt.auto = /^\d+$/.test(args[i + 1] || '') ? +next() : 2; break;
    case '--guide-d': opt.guideD = +next(); break;
    case '--guide': opt.guides.push(next().split(',').map(Number)); break;
    case '--no-label': opt.noLabel = true; break;
    case '--no-next': opt.noNext = true; break;
    default:
      if (a.startsWith('-')) { console.error(`Unknown option ${a}`); process.exit(1); }
      input = a;
  }
}
if (!input) { console.error('No STL file given'); process.exit(1); }

const project = mergeProject(opt.project ? JSON.parse(fs.readFileSync(opt.project, 'utf8')) : {});
if (opt.thickness) project.slicing.thickness = opt.thickness;
if (opt.gap != null) project.slicing.gap = opt.gap;
if (opt.contour) project.slicing.contour = opt.contour;
if (opt.height) project.transform.targetHeight = opt.height;
if (opt.scale) project.transform.scale = opt.scale;
if (opt.rotate) project.transform.rotation = opt.rotate;
if (opt.sheet) [project.output.sheetWidth, project.output.sheetHeight] = opt.sheet;
if (opt.kerf != null) project.output.kerf = opt.kerf;
if (opt.machine) project.gcode.machine = opt.machine;
if (opt.guideD) project.guide.diameter = opt.guideD;
if (opt.noLabel) project.output.label = false;
if (opt.noNext) project.output.engraveNext = false;
if (opt.auto) { project.guide.count = opt.auto; project.autoGuides = true; }
opt.guides.forEach(([x, y, d], k) => project.guides.push({ id: project.guides.length + 1 + k, x, y, diameter: d || project.guide.diameter }));

const t0 = Date.now();
const { result, files, model } = runAll(fs.readFileSync(input), project, { formats: opt.formats, mode: opt.mode });
for (const f of files) {
  const p = path.join(opt.out, f.name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.content);
}
const [w, d, h] = model.bounds.size;
console.log(`Model ${w.toFixed(1)} x ${d.toFixed(1)} x ${h.toFixed(1)} mm -> ${result.layers.length} sheets, ${result.parts.length} parts, ${result.rods.length} guide rods`);
console.log(`Wrote ${files.length} files to ${path.resolve(opt.out)} in ${Date.now() - t0} ms`);
for (const w of result.warnings) console.log(`  [${w.level}] ${w.msg}`);
