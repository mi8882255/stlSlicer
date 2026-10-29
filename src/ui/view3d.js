// 3D preview: model, extruded sheets (optionally exploded) and guide rods.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as G from '../core/geom.js';

export const createView3d = (container) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
  camera.up.set(0, 0, 1);
  camera.position.set(300, -400, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, -1.5, 2);
  scene.add(sun);

  const grid = new THREE.GridHelper(1000, 100, 0x888888, 0xcccccc);
  grid.rotation.x = Math.PI / 2;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);

  const modelGroup = new THREE.Group();
  const layersGroup = new THREE.Group();
  const rodsGroup = new THREE.Group();
  scene.add(modelGroup, layersGroup, rodsGroup);

  const modelMat = new THREE.MeshStandardMaterial({ color: 0x9aa7bd, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.3, roughness: 0.5 });

  let explode = 1;
  let lastLayers = [], lastRods = [], highlight = null;
  let fitted = false;

  const clear = (group) => {
    for (const c of [...group.children]) {
      group.remove(c);
      c.geometry?.dispose();
      if (c.material !== modelMat && c.material !== rodMat) c.material?.dispose();
    }
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);

  const loop = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();

  const fit = (bounds) => {
    const [sx, sy, sz] = bounds.size;
    const r = Math.max(sx, sy, sz * explode) || 100;
    controls.target.set(0, 0, (sz * explode) / 2);
    camera.position.set(r * 1.2, -r * 1.6, r * 1.1 + (sz * explode) / 2);
    camera.near = r / 100;
    camera.far = r * 100;
    camera.updateProjectionMatrix();
    grid.scale.setScalar(Math.max(1, r / 300));
  };

  const mapZ = (z) => z * explode; // sheet bottoms spread apart, thickness unchanged

  const shapesFor = (paths) =>
    G.islands(paths).map((isl) => {
      const toV = (p) => G.fromClipPath(p).map(([x, y]) => new THREE.Vector2(x, y));
      const shape = new THREE.Shape(toV(isl.outer));
      shape.holes = isl.holes.map((h) => new THREE.Path(toV(h)));
      return shape;
    });

  const drawLayers = () => {
    clear(layersGroup);
    const n = lastLayers.length;
    lastLayers.forEach((l, i) => {
      const geo = new THREE.ExtrudeGeometry(shapesFor(l.final || l.region), { depth: l.z1 - l.z0, bevelEnabled: false, curveSegments: 1 });
      const color = new THREE.Color().setHSL(0.08 + (0.5 * i) / Math.max(1, n - 1), 0.55, 0.6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
      mesh.userData = { index: l.index, color };
      mesh.position.z = mapZ(l.z0);
      layersGroup.add(mesh);
    });
    paintHighlight();
    drawRods();
  };

  const paintHighlight = () => {
    for (const m of layersGroup.children) {
      const isHi = m.userData.index === highlight;
      m.material.color.set(isHi ? 0x2f6fed : m.userData.color);
      m.material.emissive.set(isHi ? 0x1a3c8f : 0x000000);
    }
  };

  const drawRods = () => {
    clear(rodsGroup);
    const t = lastLayers[0] ? lastLayers[0].z1 - lastLayers[0].z0 : 0;
    for (const r of lastRods) {
      const z0 = mapZ(r.z0), z1 = mapZ(r.z1 - t) + t;
      const geo = new THREE.CylinderGeometry(r.diameter / 2, r.diameter / 2, z1 - z0 + 2, 24);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, rodMat);
      m.position.set(r.x, r.y, (z0 + z1) / 2);
      rodsGroup.add(m);
    }
  };

  return {
    setModel(tris, bounds) {
      clear(modelGroup);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(tris, 3));
      geo.computeVertexNormals();
      modelGroup.add(new THREE.Mesh(geo, modelMat));
      modelGroup.scale.z = explode;
      if (!fitted) { fit(bounds); fitted = true; }
      this.bounds = bounds;
    },
    setLayers(layers, rods) {
      lastLayers = layers;
      lastRods = rods;
      drawLayers();
    },
    setHighlight(index) {
      if (highlight === index) return;
      highlight = index;
      paintHighlight();
    },
    setExplode(k) {
      explode = k;
      modelGroup.scale.z = k;
      drawLayers();
    },
    refit() { if (this.bounds) fit(this.bounds); },
    show({ model, layers, rods }) {
      modelGroup.visible = model;
      layersGroup.visible = layers;
      rodsGroup.visible = rods;
    },
    resize,
  };
};
