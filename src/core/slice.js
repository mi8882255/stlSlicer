// Cut a welded mesh with a horizontal plane and return closed oriented loops.
// Segment direction is derived from the triangle winding, so outer contours
// come out counter-clockwise and holes clockwise (for outward-facing meshes).
// That lets the non-zero fill rule cleanly union overlapping shells later.

export const prepareMesh = ({ positions, indices }) => {
  const triCount = indices.length / 3;
  const zmin = new Float64Array(triCount);
  const zmax = new Float64Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = positions[indices[t * 3] * 3 + 2], b = positions[indices[t * 3 + 1] * 3 + 2], c = positions[indices[t * 3 + 2] * 3 + 2];
    zmin[t] = Math.min(a, b, c);
    zmax[t] = Math.max(a, b, c);
  }
  return { positions, indices, triCount, zmin, zmax, vertCount: positions.length / 3 };
};

export const sliceAt = (mesh, z) => {
  const { positions: P, indices: I, triCount, zmin, zmax, vertCount } = mesh;
  const points = new Map(); // edge key -> [x, y]
  const out = new Map(); // edge key -> [edge keys] (directed segments)
  const inDeg = new Map();

  const edgeNode = (a, b) => {
    const key = a < b ? a * vertCount + b : b * vertCount + a;
    if (!points.has(key)) {
      const za = P[a * 3 + 2], zb = P[b * 3 + 2];
      const t = za === zb ? 0 : (z - za) / (zb - za);
      points.set(key, [P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t]);
    }
    return key;
  };

  for (let t = 0; t < triCount; t++) {
    if (zmax[t] <= z || zmin[t] > z) continue;
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const up = v.map((id) => P[id * 3 + 2] > z);
    const ups = up[0] + up[1] + up[2];
    if (ups === 0 || ups === 3) continue;
    const loneIsUp = ups === 1;
    const li = up.findIndex((u) => u === loneIsUp);
    const lone = v[li], next = v[(li + 1) % 3], prev = v[(li + 2) % 3];
    let from = edgeNode(lone, next);
    let to = edgeNode(prev, lone);
    if (!loneIsUp) [from, to] = [to, from];
    if (from === to) continue;
    if (!out.has(from)) out.set(from, []);
    out.get(from).push(to);
    inDeg.set(to, (inDeg.get(to) || 0) + 1);
  }

  // Walk directed segments into loops. Start from nodes without incoming
  // segments first (open chains from broken meshes), then the closed loops.
  const loops = [];
  const take = (node) => {
    const list = out.get(node);
    if (!list || !list.length) return undefined;
    return list.pop();
  };
  const walk = (start) => {
    const loop = [points.get(start)];
    let node = take(start);
    let guard = 0;
    while (node !== undefined && node !== start && guard++ < 1e7) {
      loop.push(points.get(node));
      node = take(node);
    }
    if (loop.length >= 3) loops.push(loop);
  };
  for (const node of out.keys()) if (!inDeg.get(node)) while (out.get(node).length) walk(node);
  for (const node of out.keys()) while (out.get(node).length) walk(node);
  return loops;
};
