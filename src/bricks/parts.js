import * as THREE from 'three/webgpu';
import { STUD, PLATE, MM, C } from '../config.js';
import { Builder } from './kit.js';
import { plastic, transPlastic, glow, rubber } from './materials.js';

// Special (non-rectangular) parts, built procedurally. Positions are in stud/plate units of the builder.

const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function lathe(profile, seg = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg).toNonIndexed();
}

// Flame element (trans-orange), centred on (cx, cz) metres, base at y metres. Returns the tip height.
export function flame(b, cx, y, cz, group = 'torches', scale = 1) {
  const h = 9 * MM * scale;
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = (2.2 * MM * scale) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.55 * t);
    prof.push([Math.max(r, 0.0001), t * h]);
  }
  b.geometry(lathe(prof, 10), T(cx, y, cz), C.transOrange, 'glow:' + group);
  // two side tongues
  for (const s of [-1, 1]) {
    const g = new THREE.ConeGeometry(0.9 * MM * scale, 5 * MM * scale, 8).toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(cx + s * 1.6 * MM * scale, y + 4 * MM * scale, cz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * 0.35)),
      new THREE.Vector3(1, 1, 1),
    );
    b.geometry(g, m, C.transYellow, 'glow:' + group);
  }
  return y + h;
}

// Tiki torch: black cone, yellow round cap, flame. (x, z) = stud cell, y = plates.
export function torch(b, x, z, y, group = 'torches') {
  const cx = (x + 0.5) * STUD, cz = (z + 0.5) * STUD, Y = y * PLATE;
  const H = 14 * MM;
  b.geometry(lathe([[0, 0], [2.4 * MM, 0], [6.4 * MM, H], [0, H]]), T(cx, Y, cz), C.black);
  b.geometry(lathe([[0, 0], [7.6 * MM, 0], [7.8 * MM, 1.2 * MM], [7.6 * MM, 3.2 * MM], [0, 3.2 * MM]]), T(cx, Y + H, cz), C.yellow);
  b.collide(cx - 6 * MM, Y, cz - 6 * MM, cx + 6 * MM, Y + H + 3.2 * MM, cz + 6 * MM);
  const top = flame(b, cx, Y + H + 3.2 * MM, cz, group, 1.2);
  return new THREE.Vector3(cx, top - 3 * MM, cz);
}

// Lantern: dark grey 2x2 holder with a 1x1 round trans jewel on top.
export function lantern(b, x, z, y, color = C.transOrange) {
  b.brick(x, z, y, 2, 2, 2, C.darkBluishGrey, { studs: true });
  const cx = (x + 1) * STUD, cz = (z + 1) * STUD, Y = (y + 2) * PLATE + 1.7 * MM;
  b.geometry(lathe([[0, 0], [3.0 * MM, 0], [3.2 * MM, 2 * MM], [2.8 * MM, 5 * MM], [1.4 * MM, 6.4 * MM], [0, 6.6 * MM]], 16), T(cx, Y, cz), color, 'glow:lanterns');
  return new THREE.Vector3(cx, Y + 5 * MM, cz);
}

// Barrel (medium nougat), open top.
export function barrel(b, x, z, y, color = C.mediumNougat) {
  const cx = (x + 1) * STUD, cz = (z + 1) * STUD, Y = y * PLATE, H = 16 * MM, R = 6.6 * MM;
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([R * (0.86 + 0.14 * Math.sin(Math.PI * t)), t * H]); }
  prof.push([R * 0.8, H]); prof.push([R * 0.8, 1.5 * MM]); prof.push([0.001, 1.5 * MM]);
  b.geometry(lathe([[0.001, 0], ...prof]), T(cx, Y, cz), color);
  for (const hy of [0.18, 0.82]) b.geometry(lathe([[R * 0.97, hy * H - 0.6 * MM], [R * 1.02, hy * H], [R * 0.97, hy * H + 0.6 * MM]]), T(cx, Y, cz), C.darkOrange);
  b.collide(cx - R, Y, cz - R, cx + R, Y + H, cz + R);
}

// Clear "champagne" lamp: trans-clear bar and dish, with a warm bulb that switches with the lamps.
export function clearLamp(b, x, z, y, bricksTall = 4) {
  const cx = (x + 0.5) * STUD, cz = (z + 0.5) * STUD, Y = y * PLATE, H = bricksTall * 9.6 * MM;
  b.geometry(new THREE.CylinderGeometry(1.6 * MM, 1.6 * MM, H, 10).toNonIndexed(), T(cx, Y + H / 2, cz), C.transClear, 'trans');
  b.geometry(lathe([[0.4 * MM, 0], [8 * MM, 4 * MM], [7.6 * MM, 4.6 * MM], [0.2 * MM, 0.8 * MM]], 24), T(cx, Y + H, cz), C.transClear, 'trans');
  b.geometry(new THREE.SphereGeometry(1.8 * MM, 12, 8).toNonIndexed(), T(cx, Y + H + 2 * MM, cz), 0xffe2a8, 'glow:lamps');
  b.collide(cx - 2 * MM, Y, cz - 2 * MM, cx + 2 * MM, Y + H, cz + 2 * MM);
  return new THREE.Vector3(cx, Y + H + 4 * MM, cz);
}

// Palm tree: curved trunk built from stacked round segments, fronds as bent leaves. Returns a Group (own meshes).
export function palm(height = 10, lean = new THREE.Vector3(1, 0, 0), seed = 1) {
  const g = new THREE.Group();
  const rnd = mulberry(seed);
  const H = height * 9.6 * MM;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(lean.x * H * 0.45 * t * t, H * t, lean.z * H * 0.45 * t * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 24, 2.6 * MM, 10, false);
  // ring bands
  const tm = new THREE.Mesh(trunk, plastic(C.reddishBrown));
  tm.castShadow = tm.receiveShadow = true;
  g.add(tm);
  const ringGeo = new THREE.TorusGeometry(2.7 * MM, 0.5 * MM, 6, 12);
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const r = new THREE.Mesh(ringGeo, plastic(C.darkBrown));
    r.position.copy(p);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    r.castShadow = true;
    g.add(r);
  }
  const top = curve.getPointAt(1);
  const leafMat = plastic(C.brightGreen);
  const leafGeo = leafGeometry();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    leaf.position.copy(top);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.4;
    leaf.rotation.x = 0.15 + rnd() * 0.25;
    g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(2.6 * MM, 10, 8), plastic(C.reddishBrown));
  nut.position.copy(top);
  g.add(nut);
  g.userData.top = top;
  return g;
}

function leafGeometry() {
  // a frond: long tapered strip bending down, with a central crease (two sloped halves)
  const segs = 12, L = 52 * MM, Wd = 9 * MM;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = L * t;
    const y = 3 * MM - Math.pow(t, 1.7) * 26 * MM;
    const w = Wd * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.08)) * (1 - 0.3 * t);
    pos.push(-w, y - 0.8 * MM * (1 - t), z, 0, y + 0.8 * MM, z, w, y - 0.8 * MM * (1 - t), z);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3, b = (i + 1) * 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Small brick chicken (island farm), facing +x.
export function smallChicken(b, x, z, y) {
  b.brick(x, z, y, 2, 1, 2, C.white, { studs: false, collide: false });
  b.brick(x + 1, z, y + 2, 1, 1, 3, C.white, { studs: false, collide: false });
  b.tile(x + 2, z, y + 3, 1, 1, C.orange, { collide: false });
  b.plate(x + 1, z, y + 5, 1, 1, C.red, { collide: false });
  b.brick(x, z, y - 1, 1, 1, 1, C.yellow, { studs: false, collide: false });
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Light grey rock spire: tapered, faceted panel.
export function spire(b, x, z, y, heightBricks = 16, w = 3, d = 3) {
  const H = heightBricks * 9.6 * MM;
  const cx = (x + w / 2) * STUD, cz = (z + d / 2) * STUD, Y = y * PLATE;
  const shape = new THREE.Shape();
  const bw = w * STUD * 0.48, tw = w * STUD * 0.16;
  shape.moveTo(-bw, 0); shape.lineTo(bw, 0); shape.lineTo(bw * 0.85, H * 0.35); shape.lineTo(tw * 1.6, H * 0.62);
  shape.lineTo(tw, H); shape.lineTo(-tw * 0.6, H * 0.97); shape.lineTo(-bw * 0.5, H * 0.55); shape.lineTo(-bw * 0.95, H * 0.25); shape.lineTo(-bw, 0);
  const depth = d * STUD * 0.5;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 1.6 * MM, bevelSize: 1.2 * MM, bevelSegments: 1 });
  geo.translate(0, 0, -depth / 2);
  b.geometry(geo, T(cx, Y, cz), C.lightBluishGrey);
  b.brick(x, z, y, w, d, 3, C.lightBluishGrey, { studs: false });
  b.collide(cx - bw, Y, cz - depth / 2, cx + bw, Y + H, cz + depth / 2);
}

// White curved horn on a brown/black base, curling toward `dir` (+x default).
export function horn(b, x, z, y) {
  b.brick(x, z, y, 2, 2, 3, C.reddishBrown, { studs: false });
  b.brick(x, z, y + 3, 2, 2, 1, C.orange, { studs: false });
  b.brick(x, z, y + 4, 2, 2, 3, C.darkBrown, { studs: false });
  const cx = (x + 1) * STUD, cz = (z + 1) * STUD, Y = (y + 7) * PLATE;
  b.geometry(lathe([[0, 0], [6 * MM, 0], [6.5 * MM, 6 * MM], [5 * MM, 12 * MM], [0, 12 * MM]], 14), T(cx, Y, cz), C.black);
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-Math.sin(t * 1.4) * 22 * MM, 12 * MM + t * 40 * MM, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 20, 4.5 * MM, 10, false);
  // taper: scale radius toward tip
  const p = tube.attributes.position, tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    const ring = Math.floor(i / 11);
    const t = ring / 20;
    const c = curve.getPointAt(Math.min(1, t));
    tmp.sub(c).multiplyScalar(1 - 0.85 * t).add(c);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  tube.computeVertexNormals();
  b.geometry(tube, T(cx, Y, cz), C.white);
  b.collide(cx - STUD, Y - 7 * PLATE, cz - STUD, cx + STUD, Y + 12 * MM, cz + STUD);
}

// Treasure chest: purple base, yellow curved lid on a hinge. Returns { group, lid } (own meshes).
export function chest(colorBase = C.mediumLavender, colorLid = C.yellow) {
  const base = new Builder();
  base.brick(0, 0, 0, 4, 2, 3, colorBase, { studs: false, collide: false });
  base.tile(0, 0, 3, 4, 2, C.darkPurple, { collide: false });
  const g = base.build('chest');
  const lid = new Builder();
  lid.slope(0, 0, 0, 4, 2, 3, colorLid, 'n', { curved: true, flat: 0, low: 1, collide: false });
  const lidMesh = lid.build('chest-lid');
  const pivot = new THREE.Group();
  pivot.position.set(0, 4 * PLATE, 2 * STUD);
  lidMesh.position.set(0, 0, -2 * STUD);
  pivot.add(lidMesh);
  g.add(pivot);
  return { group: g, lid: pivot };
}

// Kart, facing +z, centred on its own origin at ground level. Wheels are an extension (flagged in the registry).
export function kart() {
  const b = new Builder();
  // chassis: 4 wide, 7 long, two seats side by side (driver left, passenger right)
  b.plate(-2, -3, 2, 4, 7, C.darkBluishGrey, { studs: false, collide: false });
  b.brick(-2, -3, 3, 4, 1, 6, C.yellow, { collide: false }); // rear block = seat backs
  b.plate(-2, -2, 3, 2, 2, C.red, { collide: false, studs: false }); // driver cushion
  b.plate(0, -2, 3, 2, 2, C.red, { collide: false, studs: false }); // passenger cushion
  b.brick(-2, 0, 3, 4, 1, 3, C.brightLightOrange, { collide: false }); // dash
  b.brick(-2, 1, 3, 4, 1, 3, C.yellow, { collide: false });
  b.slope(-2, 2, 3, 4, 2, 3, C.green, 'n', { flat: 0, low: 1, collide: false, studs: false }); // hood, low at the nose
  // steering wheel in front of the driver
  const wheelGeo = new THREE.TorusGeometry(3.6 * MM, 0.8 * MM, 8, 18).toNonIndexed();
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0, 0));
  b.geometry(wheelGeo, new THREE.Matrix4().compose(new THREE.Vector3(-1 * STUD, 7.2 * PLATE, -0.15 * STUD), tilt, new THREE.Vector3(1, 1, 1)), C.black);
  b.geometry(new THREE.CylinderGeometry(0.8 * MM, 0.8 * MM, 8 * MM, 8).toNonIndexed(), new THREE.Matrix4().compose(new THREE.Vector3(-1 * STUD, 6.4 * PLATE, 0.05 * STUD), tilt, new THREE.Vector3(1, 1, 1)), C.black);
  // lights
  b.round(-2, 4, 2, 1, 1, C.transYellow, { kind: 'trans', studs: false, collide: false });
  b.round(1, 4, 2, 1, 1, C.transYellow, { kind: 'trans', studs: false, collide: false });
  b.round(-2, -4, 3, 1, 1, C.transRed, { kind: 'trans', studs: false, collide: false });
  b.round(1, -4, 3, 1, 1, C.transRed, { kind: 'trans', studs: false, collide: false });
  const body = b.build('kart-body');
  const g = new THREE.Group();
  g.add(body);
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(7 * MM, 7 * MM, 6 * MM, 22);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(4 * MM, 4 * MM, 6.4 * MM, 16);
  hub.rotateZ(Math.PI / 2);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(tyre, rubber(0x1b1b1b));
    const h = new THREE.Mesh(hub, plastic(C.lightBluishGrey));
    t.castShadow = h.castShadow = true;
    w.add(t, h);
    w.position.set(sx * (2 * STUD + 3.5 * MM), 7 * MM, sz * 2.3 * STUD);
    const steer = new THREE.Group();
    steer.position.copy(w.position);
    w.position.set(0, 0, 0);
    steer.add(w);
    g.add(steer);
    wheels.push({ steer, wheel: w, front: sz > 0 });
  }
  g.userData.wheels = wheels;
  return g;
}

export { lathe, T };
