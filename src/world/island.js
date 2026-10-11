import * as THREE from 'three/webgpu';
import { vertexColor, float, color as tcolor, time, positionWorld, mx_noise_float, vec3, normalize, transformNormalToView, normalWorld } from 'three/tsl';
import { STUD, PLATE, MM, C } from '../config.js';
import { makeNoise, smoothstep, lerp } from './noise.js';
import { studNodes } from './studs.js';
import { Builder } from '../bricks/kit.js';
import { palm, torch, lantern, chest, smallChicken, mulberry, T, lathe } from '../bricks/parts.js';
import { plastic, glow } from '../bricks/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Dreamhouse Island: an invented world made of bricks around the scanned house. Seeded and deterministic.
// Terrain resolution: 2 x 2 studs per cell, heights quantised to plates. Sea level y = 0.

export const CELL = 2 * STUD;
export const NX = 480, NZ = 360;
export const X0 = -(NX * CELL) / 2, Z0 = -(NZ * CELL) / 2;
export const PLATEAU = 14 * PLATE; // terrain top under the house
export const WATER_Y = 0.07;

export const ZONES = {
  volcano: { x: 85, z: -66, r: 42, name: 'The Volcano' },
  jungle: { x: -98, z: -12, r: 44, name: 'Dino Jungle' },
  farm: { x: -56, z: 62, r: 26, name: 'Chicken Farm' },
  beach: { x: 64, z: 78, r: 24, name: 'Tiki Beach & Lagoon' },
  lookout: { x: 137, z: 12, r: 10, name: 'Lookout Point' },
  estate: { x: 0, z: 0, r: 22, name: 'Dreamhouse Estate' },
};

const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);

export function buildIsland() {
  const N = makeNoise(20261011);
  const H = new Float32Array(NX * NZ);
  const COL = new Uint32Array(NX * NZ);
  const ROAD = new Uint8Array(NX * NZ); // 1 road, 2 driveway, 3 shoulder
  const cx = (i) => X0 + (i + 0.5) * CELL, cz = (j) => Z0 + (j + 0.5) * CELL;

  function base(x, z) {
    let d = Math.hypot(x / 150, z / 115) + N.fbm(x * 0.012, z * 0.012) * 0.2;
    d -= 0.28 * Math.exp(-((x - 128) ** 2 + (z - 12) ** 2) / (2 * 16 ** 2));
    const land = 1 - smoothstep(0.8, 1.0, d);
    const hills = 1.4 + 3.4 * (0.5 + 0.5 * N.fbm(x * 0.018 + 5, z * 0.018 - 3)) + 1.2 * N.fbm(x * 0.06, z * 0.06);
    let h = land * hills - (1 - land) * 4.5;
    const dv = dist(x, z, ZONES.volcano);
    h += 27 * Math.pow(Math.max(0, 1 - dv / ZONES.volcano.r), 1.6) * land;
    if (dv < 7) h = Math.min(h, 21.6);
    const dl = dist(x, z, ZONES.beach);
    if (dl < 22) h = lerp(-1.3, h, smoothstep(9, 22, dl));
    const df = dist(x, z, ZONES.farm);
    h = lerp(1.7, h, smoothstep(22, 32, df));
    const dk = dist(x, z, ZONES.lookout);
    h = lerp(4.6, h, smoothstep(7, 14, dk));
    const pe = Math.hypot(x / 23, z / 19);
    h = lerp(PLATEAU, h, smoothstep(1.0, 1.45, pe));
    return h;
  }

  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) H[i + j * NX] = base(cx(i), cz(j));

  // ---- ring road: a wobbly loop, its height profile smoothed along the loop so the kart can drive it
  const loop = [];
  const NL = 420;
  for (let k = 0; k < NL; k++) {
    const a = (k / NL) * Math.PI * 2;
    const rx = 64 + 7 * Math.sin(3 * a + 1.1), rz = 50 + 6 * Math.cos(2 * a + 0.4);
    loop.push({ x: rx * Math.cos(a), z: rz * Math.sin(a) + 4 });
  }
  const hRaw = loop.map((p) => sampleGrid(H, p.x, p.z));
  const hProf = hRaw.map((_, k) => {
    let s = 0; const W = 22;
    for (let o = -W; o <= W; o++) s += hRaw[(k + o + NL) % NL];
    return Math.max(0.6, s / (2 * W + 1));
  });
  loop.forEach((p, k) => (p.h = hProf[k]));
  // driveway: from the front door south to the nearest loop point
  const door = { x: (29 - 23.5) * STUD, z: (32 - 16) * STUD };
  let best = 0, bd = 1e9;
  loop.forEach((p, k) => { const dd = Math.hypot(p.x - door.x, p.z - door.z) + (p.z < door.z ? 1e6 : 0); if (dd < bd) { bd = dd; best = k; } });
  const drive = [];
  const endP = loop[best];
  for (let k = 0; k <= 60; k++) {
    const t = k / 60;
    drive.push({ x: lerp(door.x, endP.x, t), z: lerp(door.z, endP.z, t), h: lerp(PLATEAU, endP.h, smoothstep(0.15, 0.95, t)) });
  }
  carve(loop, 2.6, 1, true);
  carve(drive, 0.8, 2, false);

  function carve(path, half, tag, closed) {
    const n = path.length;
    const segs = closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = path[k], b = path[(k + 1) % n];
      const shoulder = half + 4;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - shoulder - X0) / CELL)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + shoulder - X0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - shoulder - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + shoulder - Z0) / CELL));
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = cx(i), z = cz(j);
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const px = a.x + dx * t, pz = a.z + dz * t;
        const dd = Math.hypot(x - px, z - pz);
        const rh = lerp(a.h, b.h, t);
        const id = i + j * NX;
        if (dd <= half) { H[id] = rh; ROAD[id] = tag; }
        else if (dd < shoulder && ROAD[id] !== 1 && ROAD[id] !== 2) {
          const w = smoothstep(half, shoulder, dd);
          H[id] = lerp(rh, H[id], w);
          if (ROAD[id] === 0) ROAD[id] = 3;
        }
      }
    }
  }

  // ---- quantise and colour
  const col = (hex) => hex;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const id = i + j * NX, x = cx(i), z = cz(j);
    let h = Math.round(H[id] / PLATE) * PLATE;
    H[id] = h;
    let c;
    const dv = dist(x, z, ZONES.volcano), dj = dist(x, z, ZONES.jungle), df = dist(x, z, ZONES.farm);
    const pe = Math.hypot(x / 23, z / 19);
    if (ROAD[id] === 1 || ROAD[id] === 2) c = C.darkBluishGrey;
    else if (h < 0) c = h < -1.2 ? C.sandGreen : C.tan;
    else if (pe < 1.0) c = N.noise(x * 0.3, z * 0.3) > 0.45 ? C.green : C.brightGreen;
    else if (h < 0.75 && ROAD[id] !== 3) c = C.tan;
    else if (dv < ZONES.volcano.r && h > 5) c = h > 18 ? C.black : h > 11 ? C.darkBluishGrey : C.reddishBrown;
    else if (dj < ZONES.jungle.r) c = N.noise(x * 0.15, z * 0.15) > 0.0 ? C.green : C.darkGreen;
    else if (df < 22) { const s = Math.floor((x + 300) / 2.9) % 3; c = s === 0 ? C.lime : s === 1 ? C.darkTan : C.green; }
    else if (dist(x, z, ZONES.lookout) < 9) c = C.tan;
    else { const g = N.noise(x * 0.07 + 9, z * 0.07); c = g > 0.42 ? C.green : g < -0.62 ? C.yellowishGreen : C.brightGreen; }
    COL[id] = col(c);
  }

  const heightAt = (x, z) => sampleGrid(H, x, z);
  const group = new THREE.Group();
  group.name = 'island';

  // ---- terrain meshes in chunks
  const terrainMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  terrainMat.vertexColors = true;
  const st = studNodes();
  terrainMat.colorNode = vertexColor().mul(st.shade);
  terrainMat.normalNode = st.normalNode;
  const CH = 64;
  for (let j0 = 0; j0 < NZ; j0 += CH) for (let i0 = 0; i0 < NX; i0 += CH) {
    const geo = chunkGeometry(H, COL, i0, j0, Math.min(CH, NX - i0), Math.min(CH, NZ - j0));
    const m = new THREE.Mesh(geo, terrainMat);
    m.receiveShadow = true;
    m.castShadow = true;
    m.name = `terrain-${i0}-${j0}`;
    group.add(m);
  }

  // ---- water: trans-light-blue plates, studded, gently moving
  const waterMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x5cc4dc, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.74, ior: 1.33, specularIntensity: 1 });
  const ws = studNodes({ near: 8, far: 24, baseplateSeams: true });
  const ripple = mx_noise_float(vec3(positionWorld.x.mul(0.35), positionWorld.z.mul(0.35), time.mul(0.35)));
  const ripple2 = mx_noise_float(vec3(positionWorld.x.mul(0.35).add(0.7), positionWorld.z.mul(0.35), time.mul(0.35)));
  waterMat.normalNode = transformNormalToView(normalize(ws.nWorld.add(vec3(ripple.mul(0.06), 0, ripple2.mul(0.06)))));
  waterMat.colorNode = tcolor(0x5cc4dc).mul(ws.shade);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.name = 'water';
  water.renderOrder = 2;
  group.add(water);

  // ---- props
  const rnd = mulberry(77);
  const props = new Builder();
  const interact = [], lights = [], chests = [], spawn = {};
  const palmSpots = [];
  const okLand = (x, z, minH = 0.9) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 1 || j < 1 || i >= NX - 1 || j >= NZ - 1) return false;
    const id = i + j * NX;
    return H[id] >= minH && ROAD[id] === 0 && Math.hypot(x / 25, z / 21) > 1.0;
  };
  // palms: dense in the jungle, a line on the beaches, scattered elsewhere
  for (let k = 0; k < 900 && palmSpots.length < 190; k++) {
    let x, z;
    if (k % 3 === 0) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * ZONES.jungle.r; x = ZONES.jungle.x + Math.cos(a) * r; z = ZONES.jungle.z + Math.sin(a) * r; }
    else { x = (rnd() - 0.5) * NX * CELL * 0.9; z = (rnd() - 0.5) * NZ * CELL * 0.9; }
    const h = heightAt(x, z);
    const beachy = h > 0.15 && h < 1.2;
    if (!okLand(x, z, beachy ? 0.15 : 0.9)) continue;
    if (dist(x, z, ZONES.volcano) < 30 || dist(x, z, ZONES.farm) < 24 || dist(x, z, ZONES.lookout) < 9) continue;
    if (!beachy && dist(x, z, ZONES.jungle) > ZONES.jungle.r && rnd() < 0.6) continue;
    if (palmSpots.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
    palmSpots.push({ x, z, y: h, rot: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
  }
  group.add(palmForest(palmSpots));

  // rocks: stacked grey bricks and slopes on the coast and volcano
  for (let k = 0; k < 260 && props.boxes.length < 400; k++) {
    const x = (rnd() - 0.5) * NX * CELL * 0.92, z = (rnd() - 0.5) * NZ * CELL * 0.92;
    const h = heightAt(x, z);
    const nearV = dist(x, z, ZONES.volcano) < ZONES.volcano.r;
    if (!(h > 0.1 && (h < 1.0 || nearV))) continue;
    if (!okLand(x, z, 0.1)) continue;
    rock(props, x, h, z, rnd, nearV ? C.darkBluishGrey : C.lightBluishGrey);
  }
  // jungle ruins with lanterns
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + 0.4, r = 14 + k * 5;
    const x = ZONES.jungle.x + Math.cos(a) * r, z = ZONES.jungle.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    ruin(props, x, h, z, k);
    if (k < 2) lights.push({ pos: new THREE.Vector3(x, h + 1.4, z), color: 0xffb04a, intensity: 1.2, distance: 9, group: 'lanterns' });
  }
  // farm: barn, fences, crops, chickens
  farm(props, heightAt(ZONES.farm.x, ZONES.farm.z), rnd);
  // beach: dock, huts, torches along the path
  const beachLights = beach(props, heightAt, rnd);
  lights.push(...beachLights);
  // lookout garita
  const gh = heightAt(ZONES.lookout.x, ZONES.lookout.z);
  group.add(garita(ZONES.lookout.x, gh, ZONES.lookout.z));
  props.collide(ZONES.lookout.x - 1.8, gh, ZONES.lookout.z - 1.8, ZONES.lookout.x + 1.8, gh + 5.5, ZONES.lookout.z + 1.8);
  // road dashes
  for (let k = 0; k < NL; k += 6) {
    const p = loop[k], q = loop[(k + 2) % NL];
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    const g = new THREE.BoxGeometry(2 * STUD - 2 * MM, PLATE * 0.5, 4 * STUD).toNonIndexed();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) + PLATE * 0.25, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    props.geometry(g, m, C.yellow);
  }
  // lava
  const lavaH = heightAt(ZONES.volcano.x, ZONES.volcano.z);
  const lava = new THREE.Mesh(new THREE.CircleGeometry(6.6, 40), glow(C.transOrange, 'volcano', 2.6));
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(ZONES.volcano.x, lavaH + 0.12, ZONES.volcano.z);
  group.add(lava);
  lights.push({ pos: new THREE.Vector3(ZONES.volcano.x, lavaH + 4, ZONES.volcano.z), color: 0xff5a10, intensity: 6, distance: 60, group: 'volcano' });

  // treasure chests: one per zone and a few hidden ones
  const chestSpots = [
    [ZONES.jungle.x + 6, ZONES.jungle.z - 8], [ZONES.volcano.x - 9, ZONES.volcano.z + 2], [ZONES.farm.x + 12, ZONES.farm.z - 6],
    [ZONES.beach.x - 10, ZONES.beach.z - 14], [ZONES.lookout.x - 4, ZONES.lookout.z + 4], [-30, -48], [40, -20], [-120, 40], [110, 52],
  ];
  chestSpots.forEach(([x, z], n) => {
    let y = heightAt(x, z);
    if (y < 0.3) y = 0.3;
    const ch = chest(n % 2 ? C.reddishBrown : C.mediumLavender, n % 3 ? C.yellow : C.pearlGold);
    ch.group.position.set(x - 2 * STUD, y, z - STUD);
    group.add(ch.group);
    props.collide(x - 2 * STUD, y, z - STUD, x + 2 * STUD, y + 4 * PLATE, z + STUD);
    const id = 'treasure-' + n;
    chests.push(id);
    interact.push({ id, label: 'Open the treasure chest', pos: new THREE.Vector3(x, y, z + 1.4), radius: 2.2, kind: 'treasure', data: { pivot: ch.lid, axis: 'x', open: 1.6 } });
  });

  group.add(props.build('island-props'));

  spawn.dino = [
    { x: ZONES.jungle.x + 8, z: ZONES.jungle.z + 10 }, { x: ZONES.jungle.x - 10, z: ZONES.jungle.z - 5 }, { x: ZONES.jungle.x + 2, z: ZONES.jungle.z - 18 },
  ];

  return {
    group, heightAt, H, COL, ROAD, loop, drive, interact, lights, chests, spawn,
    boxes: props.boxes, palms: palmSpots,
    grid: { nx: NX, nz: NZ, cell: CELL, x0: X0, z0: Z0 },
  };
}

function sampleGrid(H, x, z) {
  const i = Math.max(0, Math.min(NX - 1, Math.floor((x - X0) / CELL)));
  const j = Math.max(0, Math.min(NZ - 1, Math.floor((z - Z0) / CELL)));
  return H[i + j * NX];
}

const _c = new THREE.Color();
function chunkGeometry(H, COL, i0, j0, cw, ch) {
  const pos = [], nor = [], col = [];
  const done = new Uint8Array(cw * ch);
  const quad = (ax, ay, az, bx, by, bz, cxx, cy, czz, dx, dy, dz, nx, ny, nz, r, g, b) => {
    pos.push(ax, ay, az, bx, by, bz, cxx, cy, czz, ax, ay, az, cxx, cy, czz, dx, dy, dz);
    for (let k = 0; k < 6; k++) { nor.push(nx, ny, nz); col.push(r, g, b); }
  };
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (done[i + j * cw]) continue;
    const id = i0 + i + (j0 + j) * NX;
    const h = H[id], c = COL[id];
    let w = 1;
    while (i + w < cw && !done[i + w + j * cw] && H[id + w] === h && COL[id + w] === c && w < 16) w++;
    let d = 1;
    outer: while (j + d < ch && d < 16) {
      for (let k = 0; k < w; k++) { const id2 = id + k + d * NX; if (done[i + k + (j + d) * cw] || H[id2] !== h || COL[id2] !== c) break outer; }
      d++;
    }
    for (let jj = 0; jj < d; jj++) for (let ii = 0; ii < w; ii++) done[i + ii + (j + jj) * cw] = 1;
    _c.setHex(c);
    const v = 0.94 + hash(i0 + i, j0 + j) * 0.1;
    // tops overhang their neighbours by a centimetre so merged quads never leave T-junction cracks
    const e = 0.012;
    const x0 = X0 + (i0 + i) * CELL - e, z0 = Z0 + (j0 + j) * CELL - e, x1 = X0 + (i0 + i + w) * CELL + e, z1 = Z0 + (j0 + j + d) * CELL + e;
    quad(x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0, 0, 1, 0, _c.r * v, _c.g * v, _c.b * v);
  }
  // vertical faces where a neighbour is lower
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const gi = i0 + i, gj = j0 + j, id = gi + gj * NX;
    const h = H[id];
    _c.setHex(COL[id]);
    const r = _c.r * 0.92, g = _c.g * 0.92, b = _c.b * 0.92;
    const x0 = X0 + gi * CELL, z0 = Z0 + gj * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    const nb = (a, bb) => (a < 0 || bb < 0 || a >= NX || bb >= NZ ? -6 : H[a + bb * NX]);
    let nh;
    // side faces reach a centimetre below the lower neighbour's top (no cracks)
    if ((nh = nb(gi + 1, gj)) < h && (nh -= 0.012)) quad(x1, h, z0, x1, h, z1, x1, nh, z1, x1, nh, z0, 1, 0, 0, r, g, b);
    if ((nh = nb(gi - 1, gj)) < h && (nh -= 0.012)) quad(x0, h, z1, x0, h, z0, x0, nh, z0, x0, nh, z1, -1, 0, 0, r, g, b);
    if ((nh = nb(gi, gj + 1)) < h && (nh -= 0.012)) quad(x1, h, z1, x0, h, z1, x0, nh, z1, x1, nh, z1, 0, 0, 1, r, g, b);
    if ((nh = nb(gi, gj - 1)) < h && (nh -= 0.012)) quad(x0, h, z0, x1, h, z0, x1, nh, z0, x0, nh, z0, 0, 0, -1, r, g, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Instanced palms: three variants merged into a trunk mesh and a frond mesh each.
function palmForest(spots) {
  const g = new THREE.Group();
  const variants = [0, 1, 2].map((v) => {
    const p = palm(9 + v * 2, new THREE.Vector3(Math.cos(v * 2.1), 0, Math.sin(v * 2.1)), 11 + v);
    const byMat = new Map();
    p.updateMatrixWorld(true);
    p.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      for (const n of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(n)) geo.deleteAttribute(n);
      const k = o.material.uuid;
      if (!byMat.has(k)) byMat.set(k, { mat: o.material, geos: [] });
      byMat.get(k).geos.push(geo);
    });
    return [...byMat.values()].map(({ mat, geos }) => ({ mat, geo: mergeGeometries(geos) }));
  });
  const groups = [[], [], []];
  spots.forEach((s, i) => groups[i % 3].push(s));
  variants.forEach((parts, v) => {
    const list = groups[v];
    if (!list.length) return;
    for (const { mat, geo } of parts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      list.forEach((s, k) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot); sc.setScalar(s.s); m.compose(new THREE.Vector3(s.x, s.y, s.z), q, sc); im.setMatrixAt(k, m); });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  });
  g.name = 'palms';
  return g;
}

function rock(b, x, y, z, rnd, color) {
  const n = 1 + Math.floor(rnd() * 3);
  const sx = Math.round(x / STUD), sz = Math.round(z / STUD), sy = Math.round(y / PLATE);
  for (let k = 0; k < n; k++) {
    const w = 2 + Math.floor(rnd() * 3), d = 2 + Math.floor(rnd() * 3);
    b.bricks(sx - (w >> 1) + k, sz - (d >> 1), sy + k * 3, w - k, d, 1, k === 0 ? color : C.lightBluishGrey, { studs: k === n - 1 });
  }
  if (rnd() < 0.5) b.slope(sx - 1, sz + 1, sy + n * 3, 2, 2, 3, color, rnd() < 0.5 ? 'n' : 'e');
}

function ruin(b, x, y, z, k) {
  const sx = Math.round(x / STUD), sz = Math.round(z / STUD), sy = Math.round(y / PLATE);
  const L = 8 + (k % 3) * 2;
  for (let i = 0; i < L; i += 2) {
    const hgt = 2 + ((i * 7 + k * 3) % 4);
    b.bricks(sx + i, sz, sy, 2, 2, hgt, (i + k) % 3 ? C.darkBluishGrey : C.sandGreen);
  }
  b.bricks(sx, sz + 6, sy, 2, 2, 5, C.darkBluishGrey);
  lantern(b, sx, sz + 6, sy + 15, C.transOrange);
  b.bricks(sx + L - 2, sz + 6, sy, 2, 2, 3, C.darkBluishGrey);
}

function farm(b, h, rnd) {
  const ox = Math.round(-56 / STUD), oz = Math.round(48 / STUD), sy = Math.round(h / PLATE);
  // barn: red walls with white trim, dark roof slopes (the barn has a roof; the house does not)
  const W = 16, D = 22, Hb = 6;
  for (let i = 0; i < W; i++) for (const zz of [oz, oz + D - 1]) if (!(zz === oz + D - 1 && i >= 6 && i < 10)) b.bricks(ox + i, zz, sy, 1, 1, Hb, i % 6 === 0 ? C.white : C.red, { studs: false });
  for (let j = 1; j < D - 1; j++) for (const xx of [ox, ox + W - 1]) b.bricks(xx, oz + j, sy, 1, 1, Hb, j % 6 === 0 ? C.white : C.red, { studs: false });
  for (let j = 0; j < D; j += 2) {
    b.slope(ox - 1, oz + j, sy + Hb * 3, W / 2 + 1, 2, 3 * 4, C.darkBluishGrey, 'e', { flat: 0, low: 1, studs: false });
    b.slope(ox + W / 2, oz + j, sy + Hb * 3, W / 2 + 1, 2, 3 * 4, C.darkBluishGrey, 'w', { flat: 0, low: 1, studs: false });
  }
  // fences and crops
  for (let i = -24; i < 40; i += 2) { b.bricks(ox + i, oz + D + 6, sy, 1, 1, 1, C.reddishBrown, { studs: false }); b.tile(ox + i, oz + D + 6, sy + 3, 2, 1, C.reddishBrown); }
  for (let r = 0; r < 6; r++) for (let i = -20; i < -2; i += 3) b.round(ox + i, oz + 2 + r * 3, sy, 2, 2, C.green);
  for (let k = 0; k < 9; k++) smallChicken(b, ox + 20 + Math.floor(rnd() * 14), oz + 2 + Math.floor(rnd() * 16), sy + 1);
}

function beach(b, heightAt, rnd) {
  const lights = [];
  const Z = { x: 64, z: 78 };
  // dock into the lagoon
  const dx = Math.round((Z.x - 22) / STUD), dz = Math.round((Z.z - 4) / STUD);
  for (let i = 0; i < 40; i += 4) {
    b.bricks(dx + i, dz, -6, 1, 1, 3, C.reddishBrown, { studs: false });
    b.bricks(dx + i, dz + 5, -6, 1, 1, 3, C.reddishBrown, { studs: false });
  }
  for (let i = 0; i < 42; i += 2) b.plate(dx + i, dz, 3, 2, 6, i % 4 ? C.reddishBrown : C.mediumNougat, { studs: false });
  // huts
  for (const [hx, hz] of [[Z.x - 24, Z.z - 20], [Z.x + 18, Z.z - 22]]) {
    const y = Math.round(heightAt(hx, hz) / PLATE), sx = Math.round(hx / STUD), sz = Math.round(hz / STUD);
    for (let i = 0; i < 10; i++) for (const zz of [sz, sz + 9]) b.bricks(sx + i, zz, y, 1, 1, 4, i % 2 ? C.tan : C.darkTan, { studs: false });
    for (let j = 1; j < 9; j++) for (const xx of [sx, sx + 9]) if (!(xx === sx && j > 3 && j < 6)) b.bricks(xx, sz + j, y, 1, 1, 4, j % 2 ? C.tan : C.darkTan, { studs: false });
    for (let j = 0; j < 10; j += 2) { b.slope(sx - 1, sz + j, y + 12, 6, 2, 9, C.brightGreen, 'e', { flat: 0, studs: false }); b.slope(sx + 5, sz + j, y + 12, 6, 2, 9, C.brightGreen, 'w', { flat: 0, studs: false }); }
  }
  // tiki torches along the shore path
  for (let k = 0; k < 8; k++) {
    const a = -2.4 + k * 0.42;
    const x = Z.x + Math.cos(a) * 26, z = Z.z + Math.sin(a) * 26;
    const y = Math.max(0.3, heightAt(x, z));
    const sx = Math.round(x / STUD), sz = Math.round(z / STUD), sy = Math.round(y / PLATE);
    b.bricks(sx, sz, sy, 1, 1, 3, C.reddishBrown, { studs: false });
    const p = torch(b, sx, sz, sy + 9, 'torches');
    if (k % 3 === 0) lights.push({ pos: p, color: 0xff8a2a, intensity: 1.6, distance: 10, group: 'torches' });
  }
  return lights;
}

function garita(x, y, z) {
  // sentry-box lookout: sandstone round tower, slit windows, dome, finial
  const g = new THREE.Group();
  const sand = plastic(C.tan);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 3.6, 28), sand);
  body.position.set(x, y + 1.8, z);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.25, 28), plastic(C.darkTan));
  band.position.set(x, y + 3.65, z);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), sand);
  dome.position.set(x, y + 3.75, z);
  const fin = new THREE.Mesh(lathe([[0, 0], [0.22, 0], [0.18, 0.3], [0.08, 0.5], [0.14, 0.62], [0, 0.85]], 14), plastic(C.darkTan));
  fin.position.set(x, y + 5.3, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 28), plastic(C.darkTan));
  base.position.set(x, y + 0.3, z);
  for (const o of [body, band, dome, fin, base]) { o.castShadow = o.receiveShadow = true; g.add(o); }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.2), plastic(C.black));
    slit.position.set(x + Math.cos(a) * 1.55, y + 2.6, z + Math.sin(a) * 1.55);
    slit.rotation.y = -a;
    g.add(slit);
  }
  g.name = 'garita';
  return g;
}
