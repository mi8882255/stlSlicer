// Mesh helpers: transform (rotate / scale / place on the table), bounds, welding.

export const bounds = (tris) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
};

const rotationMatrix = ([rx, ry, rz]) => {
  const r = (d) => (d * Math.PI) / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(r(rx)), Math.sin(r(rx)), Math.cos(r(ry)), Math.sin(r(ry)), Math.cos(r(rz)), Math.sin(r(rz))];
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
};

/**
 * Rotate (degrees, X then Y then Z), scale, then place the model so that it
 * stands on Z=0 and is centred in XY. Returns a new Float32Array.
 * `scale` may be a number or `{ targetHeight }` (height along Z after rotation).
 */
export const transformMesh = (tris, { rotation = [0, 0, 0], scale = 1, targetHeight = null } = {}) => {
  const m = rotationMatrix(rotation);
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  let b = bounds(out);
  const k = targetHeight ? targetHeight / (b.size[2] || 1) : scale;
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]];
  for (let i = 0; i < out.length; i += 3) {
    out[i] = (out[i] - c[0]) * k;
    out[i + 1] = (out[i + 1] - c[1]) * k;
    out[i + 2] = (out[i + 2] - c[2]) * k;
  }
  return out;
};

/**
 * Merge coincident vertices so that neighbouring triangles share edges.
 * Returns { positions: Float64Array, indices: Uint32Array }.
 */
export const weld = (tris, tolerance = 1e-5) => {
  const map = new Map();
  const positions = [];
  const indices = new Uint32Array(tris.length / 3);
  const q = (v) => Math.round(v / tolerance);
  for (let i = 0, n = tris.length / 3; i < n; i++) {
    const x = tris[i * 3], y = tris[i * 3 + 1], z = tris[i * 3 + 2];
    const key = `${q(x)},${q(y)},${q(z)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      positions.push(x, y, z);
      map.set(key, id);
    }
    indices[i] = id;
  }
  return { positions: Float64Array.from(positions), indices };
};
