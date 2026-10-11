import * as THREE from 'three/webgpu';
import { STUD, MM, C } from '../config.js';
import { plastic } from '../bricks/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Moulded toy animals. LDraw has no models for these, so they are procedural stand-ins (flagged in the registry).
// Each faces +z, origin on the ground under its centre.

const S = STUD;
const mesh = (geo, color, cast = true) => { const m = new THREE.Mesh(geo, plastic(color)); m.castShadow = cast; m.receiveShadow = true; return m; };

function spotted(geo, base, spot, scale = 30) {
  // base plastic with printed spots (TSL-free: vertex colors would need a separate material; use a canvas map)
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(base).getHexString(); g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#' + new THREE.Color(spot).getHexString();
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < scale; i++) { g.beginPath(); g.ellipse(r() * 128, r() * 128, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalNodeMaterial({ map: t, roughness: 0.32, clearcoat: 0.2, clearcoatRoughness: 0.2, ior: 1.55 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function leg(len, r, color) {
  const g = new THREE.Group();
  const m = mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 4, 10), color);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

function leaves(color = C.lime, n = 5, len = 0.5) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.06, len, 4);
  geo.translate(0, len / 2, 0);
  geo.scale(1, 1, 0.3);
  for (let i = 0; i < n; i++) {
    const m = mesh(geo, color);
    m.rotation.set(0.7 * Math.cos((i / n) * 6.28), (i / n) * 6.28, 0.7 * Math.sin((i / n) * 6.28));
    g.add(m);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), C.green));
  return g;
}

// Merge a group's direct mesh children by material (keeps animated sub-groups separate): fewer draw calls.
function mergeStatic(group) {
  const byMat = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || Array.isArray(o.material)) continue;
    o.updateMatrix();
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    group.remove(o);
  }
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
}

export function buildCreature(kind) {
  const root = new THREE.Group();
  root.name = 'creature-' + kind;
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  let head = null, tail = null, seatY = 1, speed = 3.2, radius = 0.7, rideable = true;

  if (kind === 'triceratops') {
    const torso = spotted(new THREE.SphereGeometry(1, 28, 18), C.darkBluishGrey, C.tan, 26);
    torso.scale.set(0.66, 0.6, 1.0);
    torso.position.y = 1.15;
    body.add(torso);
    const belly = mesh(new THREE.SphereGeometry(1, 20, 12), C.tan);
    belly.scale.set(0.55, 0.42, 0.85); belly.position.y = 0.95;
    body.add(belly);
    head = new THREE.Group();
    head.position.set(0, 1.3, 0.95);
    const skull = mesh(new THREE.SphereGeometry(0.4, 20, 14), C.darkBluishGrey);
    skull.scale.set(0.9, 0.85, 1.05); skull.position.set(0, -0.05, 0.3);
    const snout = mesh(new THREE.SphereGeometry(0.22, 16, 12), C.darkBluishGrey);
    snout.scale.set(0.85, 0.8, 1.2); snout.position.set(0, -0.15, 0.68);
    const beak = mesh(new THREE.ConeGeometry(0.11, 0.22, 10), C.tan);
    beak.rotation.x = Math.PI / 2 + 0.5; beak.position.set(0, -0.26, 0.86);
    const frill = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.07, 28, 1, false, -Math.PI / 2, Math.PI), C.darkBluishGrey);
    frill.rotation.set(Math.PI / 2 - 0.35, 0, 0); frill.position.set(0, 0.12, 0.02);
    const frillRim = mesh(new THREE.TorusGeometry(0.72, 0.045, 6, 24, Math.PI), C.tan);
    frillRim.rotation.set(-0.35, 0, 0); frillRim.position.set(0, 0.12, 0.0);
    head.add(skull, snout, beak, frill, frillRim);
    for (const [x, y, z, l, rx] of [[-0.2, 0.18, 0.42, 0.62, 0.55], [0.2, 0.18, 0.42, 0.62, 0.55], [0, -0.02, 0.8, 0.26, 0.4]]) {
      const h = mesh(new THREE.ConeGeometry(0.065, l, 10), C.white);
      h.geometry.translate(0, l / 2, 0);
      h.position.set(x, y, z); h.rotation.x = rx; head.add(h);
    }
    for (const s2 of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.055, 8, 6), C.black); e.position.set(s2 * 0.3, 0.05, 0.48); head.add(e); }
    body.add(head);
    tail = mesh(new THREE.ConeGeometry(0.24, 0.85, 12), C.darkBluishGrey);
    tail.rotation.x = -Math.PI / 2 - 0.3; tail.position.set(0, 1.05, -1.2);
    body.add(tail);
    for (const [x, z] of [[-0.4, 0.5], [0.4, 0.5], [-0.4, -0.5], [0.4, -0.5]]) { const l = leg(0.95, 0.2, C.tan); l.position.set(x, 0.95, z); body.add(l); legs.push(l); }
    const pl = leaves(C.brightGreen, 6, 0.55); pl.position.set(0, 1.72, -0.15); body.add(pl);
    seatY = 1.7; speed = 3.0; radius = 0.75;
  } else if (kind === 'ankylosaur') {
    const torso = spotted(new THREE.SphereGeometry(1, 28, 18), C.reddishBrown, C.tan, 40);
    torso.scale.set(0.7, 0.42, 1.0); torso.position.y = 0.72;
    body.add(torso);
    for (let i = 0; i < 9; i++) { const sp = mesh(new THREE.ConeGeometry(0.07, 0.18, 8), C.tan); const a = (i / 9) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.62, 0.78, Math.sin(a) * 0.9); body.add(sp); }
    head = new THREE.Group(); head.position.set(0, 0.7, 1.0);
    const sk = mesh(new THREE.SphereGeometry(0.3, 16, 12), C.reddishBrown); sk.scale.set(1, 0.8, 1.2);
    head.add(sk);
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.045, 8, 6), C.black); e.position.set(s * 0.22, 0.08, 0.22); head.add(e); }
    body.add(head);
    tail = new THREE.Group(); tail.position.set(0, 0.7, -0.95);
    const tl = mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.9, 10), C.reddishBrown); tl.rotation.x = -Math.PI / 2; tl.position.z = -0.4;
    const club = mesh(new THREE.SphereGeometry(0.2, 12, 10), C.tan); club.scale.set(1.4, 0.8, 1); club.position.z = -0.9;
    tail.add(tl, club); body.add(tail);
    for (const [x, z] of [[-0.45, 0.5], [0.45, 0.5], [-0.45, -0.5], [0.45, -0.5]]) { const l = leg(0.5, 0.15, C.tan); l.position.set(x, 0.5, z); body.add(l); legs.push(l); }
    const pl = leaves(C.lime, 7, 0.5); pl.position.set(0, 1.1, 0); body.add(pl);
    seatY = 1.05; speed = 2.4; radius = 0.75;
  } else if (kind === 'raptor') {
    const torso = mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 14), C.lightBluishGrey);
    torso.rotation.x = Math.PI / 2 - 0.35; torso.position.set(0, 1.15, 0);
    body.add(torso);
    head = new THREE.Group(); head.position.set(0, 1.55, 0.62);
    const sk = mesh(new THREE.CapsuleGeometry(0.15, 0.4, 4, 12), C.lightBluishGrey); sk.rotation.x = Math.PI / 2; sk.position.z = 0.15;
    head.add(sk);
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.035, 8, 6), C.black); e.position.set(s * 0.12, 0.06, 0.18); head.add(e); }
    body.add(head);
    tail = mesh(new THREE.ConeGeometry(0.2, 1.4, 12), C.darkBluishGrey);
    tail.rotation.x = -Math.PI / 2 - 0.2; tail.position.set(0, 1.0, -1.05);
    body.add(tail);
    for (const x of [-0.18, 0.18]) { const l = leg(0.95, 0.1, C.darkBluishGrey); l.position.set(x, 0.95, -0.05); body.add(l); legs.push(l); }
    for (const x of [-0.2, 0.2]) { const a = mesh(new THREE.CapsuleGeometry(0.05, 0.25, 4, 8), C.lightBluishGrey); a.position.set(x, 1.15, 0.45); a.rotation.x = 1.0; body.add(a); }
    seatY = 1.45; speed = 5.5; radius = 0.5;
  } else if (kind === 'fox') {
    const torso = mesh(new THREE.BoxGeometry(0.62, 0.55, 1.1), C.orange);
    torso.position.y = 0.6; body.add(torso);
    head = new THREE.Group(); head.position.set(0, 0.85, 0.7);
    const sk = mesh(new THREE.BoxGeometry(0.62, 0.48, 0.5), C.orange);
    const snout = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), C.white); snout.position.set(0, -0.12, 0.34);
    const nose = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), C.black); nose.position.set(0, -0.06, 0.47);
    head.add(sk, snout, nose);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08), C.orange); ear.position.set(s * 0.2, 0.32, 0); head.add(ear);
      const e = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), C.black); e.position.set(s * 0.16, 0.08, 0.26); head.add(e);
    }
    body.add(head);
    tail = new THREE.Group(); tail.position.set(0, 0.7, -0.55);
    const t1 = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.6), C.orange); t1.position.z = -0.3;
    const t2 = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.25), C.white); t2.position.z = -0.72;
    tail.add(t1, t2); tail.rotation.x = 0.3; body.add(tail);
    for (const [x, z] of [[-0.2, 0.35], [0.2, 0.35], [-0.2, -0.35], [0.2, -0.35]]) { const l = new THREE.Group(); const m = mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), C.black); m.position.y = -0.17; l.add(m); l.position.set(x, 0.34, z); body.add(l); legs.push(l); }
    seatY = 0.9; speed = 4.5; radius = 0.45; rideable = false;
  }

  mergeStatic(body);
  if (head) mergeStatic(head);
  return {
    kind, root, body, legs, head, tail, seatY, speed, radius, rideable,
    phase: Math.random() * 6, t: Math.random() * 10,
    animate(dt, v) {
      this.t += dt;
      this.phase += dt * (2 + v * 2.6);
      const a = Math.min(1, v / 1.5) * 0.6;
      this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * a; });
      if (this.tail) this.tail.rotation.y = Math.sin(this.t * 2.2) * 0.25;
      if (this.head) this.head.rotation.y = Math.sin(this.t * 0.7) * 0.2 * (v < 0.2 ? 1 : 0.2);
      this.body.position.y = v > 0.2 ? Math.abs(Math.sin(this.phase)) * 0.04 : 0;
    },
  };
}
