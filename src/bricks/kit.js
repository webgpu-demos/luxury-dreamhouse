import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STUD, PLATE, MM, GAP, STUD_R, STUD_H } from '../config.js';
import { plastic, transPlastic, glow } from './materials.js';

// Brick kit: parts are placed on the lattice in stud/plate units and merged per material, studs are instanced.
// Coordinates: x, z = stud cell of the part's corner; y = plates above the builder's origin; w, d in studs, h in plates.

const geoCache = new Map();

function roundedBox(w, h, d) {
  const key = `b${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`;
  let g = geoCache.get(key);
  if (!g) {
    const r = Math.min(0.4 * MM, w / 4, h / 4, d / 4);
    g = new RoundedBoxGeometry(w, h, d, 2, r).toNonIndexed();
    geoCache.set(key, g);
  }
  return g;
}

let _stud = null;
export function studGeometry() {
  if (_stud) return _stud;
  const r = STUD_R, h = STUD_H, e = 0.25 * MM;
  const pts = [
    new THREE.Vector2(0, -0.2 * MM),
    new THREE.Vector2(r, -0.2 * MM),
    new THREE.Vector2(r, h - e),
    new THREE.Vector2(r - e * 0.3, h - e * 0.3),
    new THREE.Vector2(r - e, h),
    new THREE.Vector2(0, h),
  ];
  _stud = new THREE.LatheGeometry(pts.slice(1), 14);
  return _stud;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// direction the "high side" of a slope faces: 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x)
const DIR_YAW = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

export class Builder {
  constructor() {
    this.bodies = new Map(); // key -> { material, geos[] }
    this.studs = new Map(); // key -> { material, matrices[] }
    this.boxes = []; // collider boxes {min:[x,y,z], max:[x,y,z]} in local metres
    this.extra = []; // ready meshes (lights, glows)
    this.solids = []; // every rectangular body, for hiding studs that another part sits on
  }

  _mat(color, kind) {
    if (kind === 'trans') return { key: 't' + color, material: transPlastic(color) };
    if (kind && kind.startsWith('glow')) {
      const group = kind.split(':')[1] || 'torches';
      return { key: 'g' + color + group, material: glow(color, group) };
    }
    return { key: 'p' + color, material: plastic(color) };
  }

  _addGeo(geo, matrix, color, kind) {
    const { key, material } = this._mat(color, kind);
    let b = this.bodies.get(key);
    if (!b) this.bodies.set(key, (b = { material, geos: [] }));
    const g = geo.clone();
    g.applyMatrix4(matrix);
    b.geos.push(g);
  }

  _addStud(x, y, z, color, kind) {
    const { key, material } = this._mat(color, kind);
    let s = this.studs.get(key);
    if (!s) this.studs.set(key, (s = { material, matrices: [] }));
    s.matrices.push(new THREE.Matrix4().makeTranslation(x, y, z));
  }

  collide(x0, y0, z0, x1, y1, z1) {
    this.boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }

  // Rectangular brick / plate / tile.
  brick(x, z, y, w, d, h, color, o = {}) {
    const W = w * STUD, D = d * STUD, H = h * PLATE;
    const X = x * STUD, Z = z * STUD, Y = y * PLATE;
    _m.makeTranslation(X + W / 2, Y + H / 2, Z + D / 2);
    this._addGeo(roundedBox(W - 2 * GAP, H, D - 2 * GAP), _m, color, o.kind);
    if (o.kind !== 'trans') this.solids.push([X, Y, Z, X + W, Y + H, Z + D]);
    if (o.studs !== false) {
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this._addStud(X + (i + 0.5) * STUD, Y + H, Z + (j + 0.5) * STUD, color, o.kind);
    }
    if (o.collide !== false) this.collide(X, Y, Z, X + W, Y + H, Z + D);
    return this;
  }
  plate(x, z, y, w, d, color, o = {}) { return this.brick(x, z, y, w, d, 1, color, o); }
  tile(x, z, y, w, d, color, o = {}) { return this.brick(x, z, y, w, d, 1, color, { ...o, studs: false }); }
  bricks(x, z, y, w, d, n, color, o = {}) { return this.brick(x, z, y, w, d, 3 * n, color, o); }

  // Slope: high side toward `dir`; rises from `low` plates to h plates; the top `flat` studs keep their studs.
  slope(x, z, y, w, d, h, color, dir = 'n', o = {}) {
    const along = dir === 'n' || dir === 's' ? d : w; // length of the slope run
    const across = dir === 'n' || dir === 's' ? w : d;
    const flat = o.flat ?? 1;
    const low = (o.low ?? 1) * PLATE;
    const L = along * STUD - 2 * GAP, A = across * STUD - 2 * GAP, H = h * PLATE;
    const fl = Math.min(flat * STUD, L);
    const shape = new THREE.Shape();
    if (o.curved) {
      shape.moveTo(0, 0); shape.lineTo(L, 0); shape.lineTo(L, H); shape.lineTo(L - fl, H);
      const steps = 10;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = (L - fl) * (1 - t);
        const v = low + (H - low) * Math.sqrt(1 - t * t) ; // quarter-ellipse falling toward the low edge
        shape.lineTo(u, v);
      }
      shape.lineTo(0, 0);
    } else {
      shape.moveTo(0, 0); shape.lineTo(L, 0); shape.lineTo(L, H); shape.lineTo(L - fl, H); shape.lineTo(0, low); shape.lineTo(0, 0);
    }
    let geo = new THREE.ExtrudeGeometry(shape, { depth: A, bevelEnabled: false, curveSegments: 8 });
    // shape is in (u=along, v=up), extruded along +z (across). Re-orient: u -> +z (high side south), across -> x.
    geo.rotateY(-Math.PI / 2); // u (x) -> +z ; extrude z -> +x... after rotation z -> -x? fix with translate below
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
    // now centered; the high side faces +z when the profile's u axis maps to +z
    const yaw = DIR_YAW[dir];
    _q.setFromAxisAngle(UP, yaw);
    const W = w * STUD, D = d * STUD;
    const cx = x * STUD + W / 2, cz = z * STUD + D / 2, Y = y * PLATE;
    _m.compose(_p.set(cx, Y, cz), _q, _s);
    const g = geo.toNonIndexed ? geo : geo;
    this._addGeo(g, _m, color, o.kind);
    // studs on the flat top strip
    if (o.studs !== false && !o.curved) {
      for (let a = 0; a < across; a++) for (let f = 0; f < flat; f++) {
        const lu = along - 1 - f; // along index from low edge
        const local = new THREE.Vector3((a + 0.5) * STUD - (across * STUD) / 2, H, (lu + 0.5) * STUD - (along * STUD) / 2);
        local.applyAxisAngle(UP, yaw);
        this._addStud(cx + local.x, Y + local.y, cz + local.z, color, o.kind);
      }
    }
    if (o.collide !== false) this.collide(x * STUD, Y, z * STUD, x * STUD + W, Y + H * 0.7, z * STUD + D);
    return this;
  }

  // Round brick/plate centred on a stud cell group (diameter in studs).
  round(x, z, y, dia, h, color, o = {}) {
    const R = (dia * STUD) / 2 - GAP, H = h * PLATE;
    const e = 0.3 * MM;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R - e, 0), new THREE.Vector2(R, e), new THREE.Vector2(R, H - e), new THREE.Vector2(R - e, H), new THREE.Vector2(0, H)];
    const key = `r${R.toFixed(4)},${H.toFixed(4)}`;
    let geo = geoCache.get(key);
    if (!geo) { geo = new THREE.LatheGeometry(pts, 24).toNonIndexed(); geoCache.set(key, geo); }
    const cx = (x + dia / 2) * STUD, cz = (z + dia / 2) * STUD, Y = y * PLATE;
    _m.makeTranslation(cx, Y, cz);
    this._addGeo(geo, _m, color, o.kind);
    if (o.studs !== false) {
      if (dia === 1) this._addStud(cx, Y + H, cz, color, o.kind);
      else for (let i = 0; i < dia; i++) for (let j = 0; j < dia; j++) this._addStud((x + i + 0.5) * STUD, Y + H, (z + j + 0.5) * STUD, color, o.kind);
    }
    if (o.collide !== false) this.collide(cx - R, Y, cz - R, cx + R, Y + H, cz + R);
    return this;
  }

  // Arbitrary geometry (already in builder-local metres) merged into the body of `color`.
  geometry(geo, matrix, color, kind) {
    this._addGeo(geo.index ? geo.toNonIndexed() : geo, matrix || new THREE.Matrix4(), color, kind);
    return this;
  }

  mesh(obj) { this.extra.push(obj); return this; }

  build(name = 'bricks') {
    const group = new THREE.Group();
    group.name = name;
    for (const { material, geos } of this.bodies.values()) {
      const merged = mergeGeometries(geos.map((g) => cleanAttributes(g)), false);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !material.transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const sg = studGeometry();
    // studs under another part are invisible: drop them (spatial hash on the lattice)
    const hash = new Map();
    const key = (x, z) => `${Math.floor(x / STUD)},${Math.floor(z / STUD)}`;
    for (const b of this.solids) {
      for (let x = b[0] + STUD / 2; x < b[3]; x += STUD) for (let z = b[2] + STUD / 2; z < b[5]; z += STUD) {
        const k = key(x, z);
        if (!hash.has(k)) hash.set(k, []);
        hash.get(k).push(b);
      }
    }
    const _v = new THREE.Vector3();
    const covered = (m) => {
      _v.setFromMatrixPosition(m);
      const list = hash.get(key(_v.x, _v.z));
      if (!list) return false;
      return list.some((b) => Math.abs(b[1] - _v.y) < PLATE * 0.2 && _v.x > b[0] && _v.x < b[3] && _v.z > b[2] && _v.z < b[5]);
    };
    for (const s of this.studs.values()) s.matrices = s.matrices.filter((m) => !covered(m));
    for (const { material, matrices } of this.studs.values()) {
      if (!matrices.length) continue;
      const im = new THREE.InstancedMesh(sg, material, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      group.add(im);
    }
    for (const e of this.extra) group.add(e);
    return group;
  }
}

// mergeGeometries needs identical attribute sets.
function cleanAttributes(g) {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// Helpers to place loose geometry in stud/plate coordinates.
export const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x * STUD, y * PLATE, z * STUD);
export { STUD, PLATE, MM };
