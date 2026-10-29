// STL parsing (binary and ASCII) into a flat Float32Array of triangle vertices:
// [ax, ay, az, bx, by, bz, cx, cy, cz, ...] — 9 floats per triangle.

const toUint8 = (data) => {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('parseStl: expected ArrayBuffer or Uint8Array');
};

const isBinary = (bytes) => {
  if (bytes.byteLength < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (84 + count * 50 === bytes.byteLength) return true;
  // Some exporters write "solid" into the binary header, so only fall back to
  // ASCII when the text really looks like ASCII STL.
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)));
  return !(/^\s*solid/i.test(head) && /facet|endsolid/i.test(head));
};

const parseBinary = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.min(view.getUint32(80, true), Math.floor((bytes.byteLength - 84) / 50));
  const out = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12; // skip normal
    for (let k = 0; k < 9; k++) out[i * 9 + k] = view.getFloat32(base + k * 4, true);
  }
  return out;
};

const parseAscii = (bytes) => {
  const text = new TextDecoder().decode(bytes);
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  const values = [];
  let m;
  while ((m = re.exec(text))) values.push(+m[1], +m[2], +m[3]);
  const triCount = Math.floor(values.length / 9);
  return Float32Array.from(values.slice(0, triCount * 9));
};

export const parseStl = (data) => {
  const bytes = toUint8(data);
  const tris = isBinary(bytes) ? parseBinary(bytes) : parseAscii(bytes);
  if (!tris.length) throw new Error('STL contains no triangles');
  return tris;
};
