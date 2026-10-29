// 2D view of one sheet with neighbours; place / drag / delete guide rods.
import * as G from '../core/geom.js';

export const createLayerView = (canvas, { onAdd, onMove, onDelete, onSelect }) => {
  const ctx = canvas.getContext('2d');
  let view = { s: 2, ox: 0, oy: 0 }; // screen = world * s + offset (y flipped)
  let data = { layer: null, below: null, above: null, guides: [], bounds: null, selected: null };
  let fitted = false;
  let drag = null;
  let hover = null;

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const toScreen = (x, y) => [x * view.s + view.ox, -y * view.s + view.oy];
  const toWorld = (sx, sy) => [(sx - view.ox) / view.s, -(sy - view.oy) / view.s];

  const fit = () => {
    const b = data.bounds;
    if (!b) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const s = Math.min(w / (b.size[0] * 1.15 || 100), h / (b.size[1] * 1.15 || 100));
    view = { s, ox: w / 2 - ((b.min[0] + b.max[0]) / 2) * s, oy: h / 2 + ((b.min[1] + b.max[1]) / 2) * s };
  };

  const tracePaths = (paths) => {
    ctx.beginPath();
    for (const p of paths) {
      p.forEach(({ X, Y }, i) => {
        const [sx, sy] = toScreen(X / G.SCALE, Y / G.SCALE);
        if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
    }
  };

  const drawGrid = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const target = 60 / view.s;
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((v) => v >= target) || 1000;
    const [x0, y1] = toWorld(0, 0), [x1, y0] = toWorld(w, h);
    ctx.strokeStyle = css('--border', '#ddd');
    ctx.lineWidth = 1;
    ctx.fillStyle = css('--muted', '#888');
    ctx.font = '10px system-ui';
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [sx] = toScreen(x, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.fillText(x, sx + 2, h - 4); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const [, sy] = toScreen(0, y); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.fillText(y, 2, sy - 2); }
    ctx.stroke();
    // origin cross
    const [cx, cy] = toScreen(0, 0);
    ctx.strokeStyle = css('--muted', '#888');
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
  };

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!fitted && data.bounds && w) { fit(); fitted = true; }
    drawGrid();
    const { layer, below, above } = data;
    if (!layer) return;

    ctx.fillStyle = 'rgba(232, 150, 70, 0.35)';
    tracePaths(layer.final || layer.region);
    ctx.fill('nonzero');
    ctx.strokeStyle = '#d0451b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    if (below) { ctx.strokeStyle = 'rgba(120,120,120,0.9)'; tracePaths(below.region); ctx.stroke(); }
    if (above) { ctx.strokeStyle = 'rgba(47,111,237,0.9)'; tracePaths(above.region); ctx.stroke(); }
    ctx.setLineDash([]);

    for (const g of data.guides) {
      const active = layer.hits?.includes(g.id);
      const [sx, sy] = toScreen(g.x, g.y);
      const r = Math.max(3, (g.diameter / 2) * view.s);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(192,57,43,0.85)' : 'rgba(150,150,150,0.25)';
      ctx.fill();
      ctx.lineWidth = g.id === data.selected || g.id === hover ? 3 : 1;
      ctx.strokeStyle = g.id === data.selected ? '#2f6fed' : active ? '#7b1d12' : '#999';
      ctx.stroke();
      ctx.fillStyle = css('--text', '#222');
      ctx.font = '12px system-ui';
      ctx.fillText(`#${g.id}`, sx + r + 3, sy - r - 2);
    }

    ctx.fillStyle = css('--muted', '#666');
    ctx.font = '12px system-ui';
    ctx.fillText('— текущий слой   - - ниже (серый)   - - выше (синий)   ● направляющая', 10, 16);
  };

  const guideAt = (sx, sy) => {
    let best = null, bd = Infinity;
    for (const g of data.guides) {
      const [gx, gy] = toScreen(g.x, g.y);
      const d = Math.hypot(gx - sx, gy - sy);
      const r = Math.max(8, (g.diameter / 2) * view.s + 4);
      if (d <= r && d < bd) { bd = d; best = g; }
    }
    return best;
  };

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const [sx, sy] = pos(e);
    const g = guideAt(sx, sy);
    drag = { sx, sy, guide: g, moved: false, view: { ...view } };
    if (g) onSelect(g.id);
  });
  window.addEventListener('mousemove', (e) => {
    const [sx, sy] = pos(e);
    if (!drag) {
      const g = guideAt(sx, sy);
      const id = g ? g.id : null;
      if (id !== hover) { hover = id; canvas.style.cursor = g ? 'move' : 'crosshair'; draw(); }
      return;
    }
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.guide) {
      const [x, y] = toWorld(sx, sy);
      drag.guide.x = +x.toFixed(2);
      drag.guide.y = +y.toFixed(2);
      draw();
    } else {
      view.ox = drag.view.ox + (sx - drag.sx);
      view.oy = drag.view.oy + (sy - drag.sy);
      draw();
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.guide && d.moved) onMove(d.guide);
    else if (!d.guide && !d.moved) {
      const [x, y] = toWorld(...pos(e));
      onAdd(+x.toFixed(2), +y.toFixed(2));
    }
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const g = guideAt(...pos(e));
    if (g) onDelete(g.id);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = pos(e);
    const [wx, wy] = toWorld(sx, sy);
    view.s *= Math.exp(-e.deltaY * 0.0015);
    view.ox = sx - wx * view.s;
    view.oy = sy + wy * view.s;
    draw();
  }, { passive: false });
  new ResizeObserver(draw).observe(canvas);

  return {
    set(next) { data = { ...data, ...next }; draw(); },
    refit() { fitted = false; draw(); },
    draw,
  };
};
