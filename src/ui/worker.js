// Heavy work (parse, transform, slice) off the main thread.
import { parseStl, loadModel, sliceModel } from '../core/project.js';

let raw = null;

self.onmessage = ({ data }) => {
  const { type, id } = data;
  try {
    if (type === 'load') {
      raw = parseStl(data.bytes);
      self.postMessage({ type: 'loaded', id, triangles: raw.length / 9 });
    } else if (type === 'slice') {
      if (!raw) throw new Error('Модель не загружена');
      const model = loadModel(raw, data.transform);
      const layers = sliceModel(model, data.slicing);
      const tris = model.tris;
      self.postMessage({ type: 'sliced', id, tris, bounds: model.bounds, layers }, [tris.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || String(err) });
  }
};
