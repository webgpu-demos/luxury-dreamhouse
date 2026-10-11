import * as THREE from 'three/webgpu';
import { STUD, PLATE, MM, C } from '../config.js';
import { Builder } from '../bricks/kit.js';
import { torch, lantern, barrel, clearLamp, palm, spire, horn, chest, flame, lathe, T } from '../bricks/parts.js';
import { plastic } from '../bricks/materials.js';

// The Luxury Dream House, LOD 200+, placed on the stud grid read from the rectified top-down photo (IMG_7109,
// docs/ortho_grid.png). Grid: col c (0..46) east, row r (0..31) south; row 0 is the front edge (spire, chicken),
// the front door is on the back edge. y is in plates above the baseplate top.

export const GRID = { cols: 47, rows: 32, originCol: 23.5, originRow: 16 };

export function cellToLocal(c, r, yPlates = 0) {
  return new THREE.Vector3(c * STUD, yPlates * PLATE, r * STUD);
}

export function buildHouse() {
  const b = new Builder();
  const registry = [];
  const interact = []; // { id, label, local: Vector3, radius, kind, data }
  const seats = {}; // name -> { local, yaw, kind }
  const lights = []; // { local, color, intensity, distance, group }
  const movers = []; // { object, half: [hx,hy,hz], offset: [x,y,z] } kinematic colliders that follow an object
  const spots = {}; // named anchors for figures and creatures
  const groups = new THREE.Group();

  const reg = (id, name, zone, cls, cells, extra = {}) => registry.push({
    id, name, zone, cls, cells, provenance: extra.provenance || 'as-built',
    affordances: extra.affordances || [], sources: extra.sources || ['IMG_7109'], confidence: extra.confidence ?? 0.7, note: extra.note,
  });

  // ---------- base plates
  b.brick(7, 0, -1, 40, 32, 1, C.baseplate, { studs: true });
  b.brick(0, 16, -1, 7, 16, 1, C.baseplate, { studs: true });
  reg('base-a', 'Main baseplate', 'base', 'Wall', [7, 0, 40, 32], { note: 'Seams between plates not verified; 40x32 as observed', confidence: 0.5 });
  reg('base-b', 'Dining-room plate', 'base', 'Wall', [0, 16, 7, 16], { confidence: 0.5 });

  // ---------- chicken (Minecraft-style), facing +x
  b.bricks(7, 2, 0, 2, 2, 3, C.yellow, { studs: false });
  b.bricks(7, 6, 0, 2, 2, 3, C.yellow, { studs: false });
  b.plate(7, 1, 0, 3, 3, C.orange, { studs: false });
  b.plate(7, 6, 0, 3, 3, C.orange, { studs: false });
  b.bricks(4, 1, 9, 7, 8, 4, C.white, { studs: false });
  b.bricks(9, 2, 18, 4, 6, 5, C.white, { studs: false }); // head (top lid separate)
  b.brick(13, 3, 21, 2, 4, 3, C.brightLightOrange, { studs: false }); // beak
  b.brick(13, 4, 17, 1, 2, 4, C.red, { studs: false }); // wattle
  // eyes on the head's front face
  const eyeGeo = new THREE.BoxGeometry(0.6 * MM, 3.2 * PLATE, 1.9 * STUD).toNonIndexed();
  for (const z of [2.95, 7.05]) b.geometry(eyeGeo, T(13 * STUD + 0.3 * MM, 28.5 * PLATE, z * STUD), C.black);
  // wings: white plates on grey clip hinges, angled out from the body sides
  for (const side of [-1, 1]) {
    const zEdge = side < 0 ? 1 : 9;
    const hinge = new THREE.BoxGeometry(1.6 * STUD, 1.2 * PLATE, 0.6 * STUD).toNonIndexed();
    b.geometry(hinge, T(7.5 * STUD, 15 * PLATE, (zEdge + side * 0.3) * STUD), C.lightBluishGrey);
    const wing = new THREE.BoxGeometry(4 * STUD, 1 * PLATE, 2 * STUD).toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(7.2 * STUD, 15.5 * PLATE, (zEdge + side * 1.2) * STUD),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.55, 0, 0)), new THREE.Vector3(1, 1, 1));
    b.geometry(wing, m, C.white);
  }
  // red inside the head, seen when the lid is open
  b.brick(10, 3, 30, 2, 4, 2, C.red, { studs: false, collide: false });
  const lidB = new Builder();
  lidB.brick(0, 0, 0, 4, 6, 1, C.white, { collide: false, studs: false });
  lidB.plate(0.5, 1, 1, 1, 1, C.white, { collide: false });
  lidB.plate(2.5, 4, 1, 1, 1, C.white, { collide: false });
  const lid = lidB.build('chicken-lid');
  const lidPivot = new THREE.Group();
  lidPivot.position.copy(cellToLocal(9, 2, 33));
  lidPivot.add(lid);
  groups.add(lidPivot);
  reg('chicken', 'Giant chicken', 'chicken', 'Creature', [4, 0, 11, 10], {
    affordances: ['open'], sources: ['IMG_7107', 'IMG_7110', 'IMG_7116', 'IMG_7122'], confidence: 0.6,
    note: 'Brick-built; lid hinge read from IMG_7116',
  });
  interact.push({ id: 'chicken', label: 'Open the chicken’s head', local: cellToLocal(14, 5, 6), radius: 3.2, kind: 'hinge', data: { pivot: lidPivot, axis: 'z', open: 1.9 } });

  // fiery slide in front of the chicken
  b.slope(12, 0, 0, 3, 4, 6, C.white, 'w', { curved: true, flat: 1, low: 1 });
  b.brick(12, 0, 6, 1, 2, 3, C.red, { studs: true });
  flame(b, 12.5 * STUD, 9 * PLATE + 1.7 * MM, 1 * STUD, 'torches', 1.1);
  lights.push({ local: cellToLocal(12.5, 1, 13), color: 0xff8a2a, intensity: 1.2, distance: 6, group: 'torches' });
  reg('slide', 'Fire slide', 'chicken', 'Prop', [12, 0, 3, 4], { affordances: ['climb'] });

  // colourful stack beside the throne
  b.bricks(13, 4, 0, 2, 2, 1, C.magenta);
  b.bricks(15, 4, 0, 2, 2, 1, C.white);
  b.bricks(14, 5, 3, 1, 2, 1, C.mediumLavender);
  b.bricks(15, 6, 0, 2, 2, 1, C.darkAzure);
  b.bricks(16, 4, 3, 1, 2, 1, C.white);
  reg('stack', 'Colour stack', 'throne', 'Prop', [13, 4, 4, 4]);

  // ---------- throne (yellow), faces east
  b.brick(12, 9, 0, 4, 6, 3, C.yellow, { studs: false });
  b.plate(13, 10, 3, 3, 4, C.yellow, { studs: false });
  b.bricks(12, 9, 3, 1, 6, 4, C.yellow);
  b.bricks(13, 9, 3, 3, 1, 1, C.yellow);
  b.bricks(13, 14, 3, 3, 1, 1, C.yellow);
  b.slope(12, 8, 15, 1, 8, 3, C.brightLightOrange, 'e', { flat: 1, curved: true });
  seats.throne = { local: cellToLocal(14.4, 12, 4), yaw: Math.PI / 2, kind: 'sit' };
  b.tile(17, 11, 0, 3, 3, C.darkBlue);
  b.tile(20, 8, 0, 1, 8, C.mediumAzure);
  reg('throne', 'Yellow throne', 'throne', 'Seat', [12, 8, 4, 7], { affordances: ['sit'], sources: ['IMG_7109', 'IMG_7110', 'IMG_7122'] });
  interact.push({ id: 'throne', label: 'Sit on the throne', local: cellToLocal(16.5, 12, 3), radius: 2.2, kind: 'seat', data: { seat: 'throne' } });

  // side table
  b.bricks(17, 9, 0, 2, 2, 1, C.tan);
  b.brick(18, 11, 0, 1, 2, 3, C.white);

  // ---------- campfire patio (front middle)
  b.plate(31, 1, 0, 2, 2, C.darkRed);
  for (const yaw of [0.4, -0.4]) {
    const log = new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, 1.8 * STUD, 8).toNonIndexed();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(32 * STUD, 1 * PLATE + 1.3 * MM, 2 * STUD), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, yaw)), new THREE.Vector3(1, 1, 1));
    b.geometry(log, m, C.reddishBrown);
  }
  flame(b, 32 * STUD, 1 * PLATE + 2 * MM, 2 * STUD, 'campfire', 1.6);
  lights.push({ local: cellToLocal(32, 2, 5), color: 0xff7a1a, intensity: 2.0, distance: 9, group: 'campfire' });
  interact.push({ id: 'campfire', label: 'Light / put out the campfire', local: cellToLocal(32, 2, 1), radius: 2.0, kind: 'light', data: { group: 'campfire' } });
  b.brick(34, 2, 0, 1, 1, 3, C.darkTan, { studs: false });
  b.brick(34, 5, 0, 1, 1, 3, C.darkTan, { studs: false });
  b.plate(34, 2, 3, 2, 4, C.tan);
  seats.bench = { local: cellToLocal(35, 4, 4), yaw: -Math.PI / 2, kind: 'sit' };
  interact.push({ id: 'bench', label: 'Sit by the fire', local: cellToLocal(35.5, 4, 3), radius: 1.8, kind: 'seat', data: { seat: 'bench' } });
  for (let r = 2; r < 5; r++) b.brick(30, r, 0, 1, 1, 3, C.darkBluishGrey, { studs: true });
  b.round(33, 0, 0, 1, 3, C.green);
  b.bricks(35, 1, 0, 2, 1, 1, C.reddishBrown);
  reg('campfire', 'Campfire patio', 'patio', 'Light', [30, 0, 7, 7], { affordances: ['ignite', 'sit'], sources: ['IMG_7109', 'IMG_7117', 'IMG_7121'] });

  // ---------- TV wall
  b.bricks(32, 7, 0, 6, 1, 1, C.yellow);
  b.bricks(32, 7, 3, 6, 1, 1, C.transLightBlue, { kind: 'trans' });
  b.bricks(32, 7, 6, 6, 1, 1, C.yellow);
  b.brick(33, 6, 9, 4, 1, 6, C.black, { studs: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * STUD, 1.7 * BRICKS(1.9)), new THREE.MeshBasicNodeMaterial({ color: 0x2b6cff }));
  screen.position.copy(cellToLocal(35, 5.99, 12));
  screen.rotation.y = Math.PI;
  screen.name = 'tv-screen';
  b.mesh(screen);
  reg('tv', 'TV wall', 'patio', 'Prop', [32, 6, 6, 2], { confidence: 0.5, note: 'Read as a TV from IMG_7117; ask the builder' });

  // ---------- treasure chest
  const ch = chest(C.mediumLavender, C.yellow);
  ch.group.position.copy(cellToLocal(42, 0, 2));
  ch.group.rotation.y = -Math.PI / 2;
  groups.add(ch.group);
  b.collide(40 * STUD, 0, 2 * STUD, 42 * STUD, 4 * PLATE, 6 * STUD);
  reg('chest', 'Treasure chest', 'front', 'Container', [40, 2, 2, 4], { affordances: ['open'], sources: ['IMG_7109', 'IMG_7121'] });
  interact.push({ id: 'chest', label: 'Open the treasure chest', local: cellToLocal(39, 4, 2), radius: 2.0, kind: 'hinge', data: { pivot: ch.lid, axis: 'x', open: 1.6 } });

  // ---------- spire and the lantern wall along the east edge
  spire(b, 44, 1, 0, 16, 3, 3);
  reg('spire', 'Rock spire', 'front', 'Wall', [44, 1, 3, 3], { sources: ['IMG_7105', 'IMG_7117', 'IMG_7121'], confidence: 0.6 });
  for (const [r0, len] of [[5, 4], [11, 4], [17, 4]]) {
    b.bricks(44, r0, 0, 2, len, 2, C.lightBluishGrey);
    b.bricks(46, r0, 0, 1, len, 1, C.darkBluishGrey);
  }
  for (const r of [9, 15, 21]) {
    const p = lantern(b, 44, r, 0, r === 15 ? C.transYellow : C.transOrange);
    lights.push({ local: p, color: 0xffb04a, intensity: 0.9, distance: 6, group: 'lanterns' });
  }
  reg('lantern-wall', 'Stone wall with lanterns', 'front', 'Wall', [44, 5, 3, 18], { affordances: ['ignite'], sources: ['IMG_7109', 'IMG_7121', 'IMG_7122'] });
  interact.push({ id: 'lanterns', label: 'Switch the lanterns', local: cellToLocal(43, 15, 2), radius: 2.0, kind: 'light', data: { group: 'lanterns' } });

  // ---------- horn sculpture
  horn(b, 45, 26, 0);
  reg('horn', 'White horn', 'front', 'Prop', [45, 26, 2, 2], { sources: ['IMG_7109', 'IMG_7121'], confidence: 0.5 });

  // ---------- rainbow tower with the barrel on top
  const courses = [C.blue, C.lime, C.yellow, C.darkGreen, C.darkAzure, C.green, C.darkBluishGrey, C.blue, C.green, C.mediumAzure, C.blue, C.mediumLavender, C.reddishBrown, C.darkBluishGrey, C.red];
  courses.forEach((col, i) => {
    b.bricks(37, 13, i * 3, 4, 2, 1, col, { studs: i === courses.length - 1, collide: false });
    b.bricks(37, 15, i * 3, 4, 2, 1, courses[(i + 3) % courses.length], { studs: i === courses.length - 1, collide: false });
  });
  b.collide(37 * STUD, 0, 13 * STUD, 41 * STUD, 45 * PLATE, 17 * STUD);
  barrel(b, 38, 14, 45);
  reg('tower', 'Rainbow tower', 'centre', 'Wall', [37, 13, 4, 4], { affordances: ['climb'], sources: ['IMG_7107', 'IMG_7121', 'IMG_7122'], confidence: 0.6 });

  // ---------- palm on its blue base
  b.plate(30, 13, 0, 4, 4, C.blue);
  b.bricks(31, 14, 1, 2, 2, 1, C.lightBluishGrey);
  b.bricks(30, 17, 0, 4, 2, 1, C.lime);
  const p1 = palm(11, new THREE.Vector3(0.9, 0, 0.25), 3);
  p1.position.copy(cellToLocal(32, 15, 4));
  groups.add(p1);
  b.collide(31.6 * STUD, 4 * PLATE, 14.6 * STUD, 32.4 * STUD, 30 * PLATE, 15.4 * STUD);
  reg('palm', 'Palm tree', 'centre', 'Plant', [30, 13, 4, 6], { sources: ['IMG_7105', 'IMG_7111', 'IMG_7121'] });
  spots.princess = { local: cellToLocal(27.5, 15.5, 0), yaw: Math.PI / 2 };
  reg('princess', 'Princess', 'centre', 'Figure', [27, 15, 1, 1], { affordances: ['talk'], sources: ['IMG_7105', 'IMG_7110'] });

  // ---------- computer corner, darts, lamps
  b.round(21, 17, 0, 4, 1, C.lightBluishGrey, { studs: false });
  b.bricks(22, 18, 1, 2, 2, 1, C.white);
  b.tile(22, 18, 4, 2, 1, C.mediumAzure);
  b.tile(22, 14, 0, 2, 2, C.white);
  b.tile(22, 15, 1, 2, 1, C.red);
  const dart = dartboard();
  dart.position.copy(cellToLocal(20.6, 21.5, 5));
  dart.rotation.y = Math.PI / 2;
  b.mesh(dart);
  b.bricks(20, 21, 0, 1, 1, 1, C.red);
  reg('computer', 'Computer desk', 'centre', 'Prop', [21, 17, 4, 4], { sources: ['IMG_7109', 'IMG_7112'] });
  reg('darts', 'Dartboard', 'centre', 'Prop', [20, 21, 3, 1], { confidence: 0.5 });
  for (const [c, r] of [[20, 27], [21, 30]]) lights.push({ local: clearLamp(b, c, r, 0, 4), color: 0xffd9a0, intensity: 0.8, distance: 6, group: 'lamps' });
  reg('lamps', 'Clear lamps', 'patio', 'Light', [20, 27, 2, 4], { affordances: ['ignite'], sources: ['IMG_7105', 'IMG_7111', 'IMG_7122'] });
  interact.push({ id: 'lamps', label: 'Switch the lamps', local: cellToLocal(21.5, 28.5, 2), radius: 2.0, kind: 'light', data: { group: 'lamps' } });

  // ---------- fence on the front edge
  fence(b, 24, 0, 0, 4);
  reg('fence-front', 'White fence', 'front', 'Wall', [24, 0, 4, 1]);

  // ---------- sofa, yellow patio, front door with torches (back edge)
  b.brick(24, 22, 0, 2, 6, 3, C.red, { studs: false });
  b.plate(24, 22, 3, 2, 6, C.red, { studs: false });
  b.bricks(26, 22, 0, 1, 6, 3, C.black);
  fence(b, 26, 22, 9, 6, 'z');
  seats.sofa = { local: cellToLocal(25, 25, 4), yaw: -Math.PI / 2, kind: 'sit' };
  reg('sofa', 'Sofa', 'patio', 'Seat', [24, 22, 3, 6], { affordances: ['sit'], confidence: 0.5, note: 'Read from IMG_7111 / IMG_7118' });
  interact.push({ id: 'sofa', label: 'Sit on the sofa', local: cellToLocal(23, 25, 2), radius: 2.0, kind: 'seat', data: { seat: 'sofa' } });
  b.plate(27, 22, 0, 4, 7, C.yellow);

  // frame posts and lintel (static), door panel on a hinge
  b.brick(27, 30, 0, 1, 1, 18, C.white, { studs: false });
  b.brick(30.5, 30, 0, 0.5, 1, 18, C.white, { studs: false });
  b.brick(27, 30, 17, 4, 1, 1, C.white, { studs: true });
  b.brick(27, 30, 0, 4, 1, 0.5, C.white, { studs: false, collide: false });
  const tl = torch(b, 27, 30, 18), tr = torch(b, 30, 30, 18);
  lights.push({ local: tl, color: 0xff8a2a, intensity: 1.4, distance: 8, group: 'torches' });
  lights.push({ local: tr, color: 0xff8a2a, intensity: 1.4, distance: 8, group: 'torches' });
  const door = frontDoor();
  const doorPivot = new THREE.Group();
  doorPivot.position.copy(cellToLocal(28, 30.5, 0.5));
  doorPivot.add(door);
  groups.add(doorPivot);
  movers.push({ object: door, half: [1.25 * STUD, 8.25 * PLATE, 0.12 * STUD], offset: [1.25 * STUD, 8.25 * PLATE, 0] });
  reg('front-door', 'Front door', 'entrance', 'Door', [27, 30, 4, 1], { affordances: ['open'], sources: ['IMG_7105', 'IMG_7111', 'IMG_7121'] });
  reg('torches', 'Tiki torches', 'entrance', 'Light', [27, 30, 4, 1], { affordances: ['ignite'], sources: ['IMG_7105', 'IMG_7106', 'IMG_7111'] });
  interact.push({ id: 'front-door', label: 'Open / close the front door', local: cellToLocal(29.3, 30.5, 2), radius: 2.4, kind: 'hinge', data: { pivot: doorPivot, axis: 'y', open: 1.75 } });
  interact.push({ id: 'torches', label: 'Light / put out the torches', local: cellToLocal(25.6, 31.4, 0), radius: 1.3, kind: 'light', data: { group: 'torches' } });

  // ---------- jail cell (dark floor, barred door)
  b.plate(9, 17, 0, 7, 7, C.darkBluishGrey, { studs: false });
  b.brick(15, 17, 1, 1, 1, 17, C.black, { studs: false });
  b.brick(15, 21.5, 1, 1, 0.5, 17, C.black, { studs: false });
  b.brick(15, 17, 17, 1, 5, 1, C.black, { studs: true });
  const jail = jailDoor();
  const jailPivot = new THREE.Group();
  jailPivot.position.copy(cellToLocal(15.5, 18, 1));
  jailPivot.add(jail);
  groups.add(jailPivot);
  movers.push({ object: jail, half: [0.1 * STUD, 8 * PLATE, 1.75 * STUD], offset: [0, 8 * PLATE, 1.75 * STUD] });
  reg('jail', 'Jail cell', 'cell', 'Door', [9, 17, 7, 7], { affordances: ['open'], sources: ['IMG_7108', 'IMG_7110', 'IMG_7123'], note: 'Barred door read as a cell; ask the builder' });
  interact.push({ id: 'jail', label: 'Open / close the cell door', local: cellToLocal(16.3, 20, 2), radius: 2.2, kind: 'hinge', data: { pivot: jailPivot, axis: 'y', open: 1.6 } });
  b.brick(8, 18, 0, 2, 2, 3, C.red, { studs: true });
  b.round(9, 18, 3, 1, 1, C.yellow);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(5.2 * MM, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), plastic(C.yellow));
  helmet.position.copy(cellToLocal(8.6, 20.6, 1));
  helmet.castShadow = true;
  b.mesh(helmet);
  b.tile(8, 22, 0, 2, 2, C.lightBluishGrey);
  b.bricks(18, 18, 0, 2, 2, 2, C.darkGreen);
  b.bricks(18, 20, 0, 2, 1, 1, C.red);

  // ---------- dining room (magenta walls on its own plate)
  b.bricks(0, 16, 0, 5, 1, 2, C.magenta);
  b.brick(5, 16, 0, 2, 1, 6, C.transRed, { kind: 'trans' });
  b.bricks(7, 16, 0, 1, 1, 2, C.magenta);
  b.bricks(0, 17, 0, 1, 14, 2, C.magenta);
  b.bricks(0, 31, 0, 4, 1, 2, C.magenta);
  for (const r of [16, 31]) b.slope(0, r, 6, 1, 1, 2, C.magenta, 'w', { flat: 0 });
  b.bricks(1, 24, 0, 2, 2, 1, C.black);
  // table
  b.bricks(4, 26, 0, 2, 2, 2, C.darkPink);
  b.plate(3, 25, 6, 4, 4, C.blue, { studs: false });
  b.tile(3, 25, 6, 4, 4, C.blue);
  burger(b, 4, 26, 7);
  ketchup(b, 3, 27, 7);
  // seats facing each other across the table
  b.brick(4, 29, 0, 2, 2, 3, C.tan);
  b.brick(4, 23, 0, 2, 2, 3, C.lime);
  seats.diningSouth = { local: cellToLocal(5, 30, 3), yaw: Math.PI, kind: 'sit' };
  seats.diningNorth = { local: cellToLocal(5, 24, 3), yaw: 0, kind: 'sit' };
  b.bricks(6, 29, 0, 2, 2, 1, C.tan);
  reg('dining', 'Dining room', 'dining', 'Seat', [0, 16, 8, 16], { affordances: ['sit', 'eat'], sources: ['IMG_7108', 'IMG_7113', 'IMG_7115', 'IMG_7119', 'IMG_7120', 'IMG_7123'] });
  reg('hugo', 'Hugo (dad)', 'dining', 'Figure', [4, 29, 2, 2], { sources: ['IMG_7108', 'IMG_7113', 'IMG_7120'] });
  reg('dada', 'Dada (son)', 'dining', 'Figure', [4, 23, 2, 2], { sources: ['IMG_7108', 'IMG_7113', 'IMG_7120'] });
  interact.push({ id: 'dining-s', label: 'Sit at the table', local: cellToLocal(6.5, 30.5, 2), radius: 1.6, kind: 'seat', data: { seat: 'diningSouth' } });
  interact.push({ id: 'dining-n', label: 'Sit at the table', local: cellToLocal(6.5, 23.5, 2), radius: 1.6, kind: 'seat', data: { seat: 'diningNorth' } });
  spots.kart = { local: cellToLocal(3.6, 20, 0), yaw: 0 };
  reg('kart', 'Go-kart', 'dining', 'Vehicle', [2, 18, 4, 4], { affordances: ['drive'], sources: ['IMG_7108', 'IMG_7120'], note: 'Wheels are an extension' });
  reg('kart-wheels', 'Kart wheels', 'dining', 'Vehicle', [2, 18, 4, 4], { provenance: 'extension' });

  // flower box, yellow floor, kitchen stack, grey floor
  b.brick(9, 26, 0, 3, 4, 3, C.mediumNougat, { studs: false });
  b.tile(9.5, 26.5, 3, 2, 3, C.darkAzure);
  flower(b, 10, 27.5, 3);
  b.plate(12, 24, 0, 4, 6, C.yellow, { studs: false });
  b.tile(12, 24, 1, 4, 6, C.yellow);
  b.bricks(17, 25, 0, 2, 2, 2, C.red);
  b.bricks(16, 28, 0, 2, 2, 1, C.reddishBrown);
  b.bricks(18, 29, 0, 2, 2, 1, C.lime);
  b.bricks(16, 30, 0, 2, 1, 1, C.orange);
  b.bricks(19, 25, 0, 1, 2, 1, C.darkGreen);
  b.plate(18, 28, 0, 3, 3, C.darkBluishGrey, { studs: false });
  reg('flowerbox', 'Flower box', 'dining', 'Plant', [9, 26, 3, 4]);
  reg('kitchen', 'Kitchen stack', 'dining', 'Prop', [16, 25, 4, 6], { confidence: 0.4 });

  // ---------- bed (rainbow) on the lime quarter-circle
  quarterCircle(b, 33, 22, 0, 6, C.lime);
  [C.mediumAzure, C.orange, C.mediumLavender, C.blue].forEach((col, i) => b.bricks(34, 24 + i, 1, 5, 1, 1, col));
  b.plate(39, 24, 1, 3, 4, C.yellow);
  b.bricks(39, 24, 2, 3, 4, 1, C.yellow, { studs: false });
  b.slope(42, 24, 1, 1, 4, 9, C.yellow, 'w', { curved: true, flat: 1, low: 1 });
  b.bricks(42.5, 25, 0, 2, 2, 2, C.red);
  seats.bed = { local: cellToLocal(38, 26, 4), yaw: -Math.PI / 2, kind: 'sleep' };
  reg('bed', 'Rainbow bed', 'bedroom', 'Seat', [33, 22, 11, 6], { affordances: ['sleep'], sources: ['IMG_7109', 'IMG_7111', 'IMG_7121'] });
  interact.push({ id: 'bed', label: 'Sleep (day ↔ night)', local: cellToLocal(37, 29, 2), radius: 2.2, kind: 'sleep', data: { seat: 'bed' } });

  // ---------- creatures' home spots (built by creatures.js)
  spots.triceratops = { local: cellToLocal(25, 3, 0), yaw: -Math.PI / 2 };
  spots.fox = { local: cellToLocal(26, 7.6, 0), yaw: -Math.PI / 2 };
  spots.ankylosaur = { local: cellToLocal(25.5, 11.5, 0), yaw: Math.PI / 2 };
  spots.raptor = { local: cellToLocal(31.5, 10.6, 0), yaw: Math.PI / 2 };
  spots.blocky = { local: seats.throne.local.clone(), yaw: Math.PI / 2 };
  spots.hugo = { seat: 'diningSouth' };
  spots.dada = { seat: 'diningNorth' };
  reg('triceratops', 'Triceratops', 'yard', 'Creature', [21, 1, 8, 4], { affordances: ['ride'], provenance: 'inferred', note: 'Moulded toy; procedural stand-in' });
  reg('ankylosaur', 'Ankylosaur', 'yard', 'Creature', [24, 10, 4, 3], { affordances: ['ride'], provenance: 'inferred' });
  reg('raptor', 'Raptor', 'yard', 'Creature', [29, 10, 5, 2], { affordances: ['ride'], provenance: 'inferred' });
  reg('fox', 'Fox', 'yard', 'Creature', [22, 7, 8, 2], { provenance: 'inferred' });

  // ---------- extensions (ground level only; hidden by "As built")
  const ext = new Builder();
  ext.plate(0, 32, -1, 9, 10, C.darkBluishGrey, { studs: false });
  ext.tile(0, 32, 0, 9, 10, C.darkBluishGrey);
  ext.bricks(0, 32, 0, 1, 10, 1, C.magenta);
  for (let r = 33; r < 41; r += 2) ext.tile(4, r, 1, 1, 1, C.yellow);
  ext.plate(27, 32, -1, 4, 12, C.darkBluishGrey, { studs: false });
  ext.tile(27, 32, 0, 4, 12, C.darkBluishGrey);
  reg('garage', 'Garage bay', 'extension', 'Wall', [0, 32, 9, 10], { provenance: 'extension' });
  reg('driveway', 'Driveway', 'extension', 'Wall', [27, 32, 4, 12], { provenance: 'extension' });
  const extGroup = ext.build('extensions');

  const group = new THREE.Group();
  group.name = 'house';
  group.add(b.build('house-static'));
  group.add(groups);
  group.add(extGroup);
  return { group, extGroup, boxes: b.boxes, extBoxes: ext.boxes, registry, interact, seats, lights, movers, spots };
}

function BRICKS(n) { return n * 9.6 * MM; }

function fence(b, x, z, y, len, axis = 'x') {
  // 1 x len fence: rail tile on posts
  const along = axis === 'x';
  if (along) b.tile(x, z, y, len, 1, C.white); else b.tile(x, z, y, 1, len, C.white);
  for (let i = 0; i < len; i++) {
    const cx = along ? x + i + 0.5 : x + 0.5, cz = along ? z + 0.5 : z + i + 0.5;
    b.geometry(new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, 6 * PLATE, 8).toNonIndexed(), T(cx * STUD, (y + 1 + 3) * PLATE, cz * STUD), C.white);
  }
  if (along) b.tile(x, z, y + 7, len, 1, C.white); else b.tile(x, z, y + 7, 1, len, C.white);
}

function quarterCircle(b, x, z, y, n, color) {
  const R = n * STUD;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(R, 0); shape.absarc(0, 0, R, 0, Math.PI / 2, false); shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: PLATE, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(Math.PI / 2);
  // shape (x, y) -> (x, z) after rotation; y up was extrude depth, now downward; lift by PLATE
  b.geometry(g, T(x * STUD, (y + 1) * PLATE, z * STUD), color);
  b.collide(x * STUD, y * PLATE, z * STUD, (x + n) * STUD * 0.8, (y + 1) * PLATE, (z + n) * STUD * 0.8);
}

function burger(b, x, z, y) {
  const cx = (x + 1) * STUD, cz = (z + 1) * STUD, Y = y * PLATE;
  const layers = [[C.tan, 1.4], [C.reddishBrown, 1.8], [C.red, 0.8], [C.lime, 0.6], [C.reddishBrown, 1.6]];
  let yy = Y;
  for (const [col, h] of layers) { b.geometry(lathe([[0, 0], [6.6 * MM, 0], [6.8 * MM, h * MM * 0.5], [6.6 * MM, h * MM], [0, h * MM]], 20), T(cx, yy, cz), col); yy += h * MM; }
  b.geometry(lathe([[0, 0], [6.8 * MM, 0], [6.4 * MM, 2.6 * MM], [4.2 * MM, 4.4 * MM], [0, 5 * MM]], 20), T(cx, yy, cz), C.tan);
}

function ketchup(b, x, z, y) {
  const cx = (x + 0.5) * STUD, cz = (z + 0.5) * STUD, Y = y * PLATE;
  b.geometry(lathe([[0, 0], [3.6 * MM, 0], [3.8 * MM, 6 * MM], [3.0 * MM, 9 * MM], [0, 9 * MM]], 16), T(cx, Y, cz), C.white);
  b.geometry(lathe([[0, 0], [3.0 * MM, 0], [3.0 * MM, 2.4 * MM], [1.0 * MM, 5.4 * MM], [0, 5.6 * MM]], 16), T(cx, Y + 9 * MM, cz), C.red);
}

function flower(b, x, z, y) {
  const cx = x * STUD, cz = z * STUD, Y = y * PLATE;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.geometry(new THREE.CylinderGeometry(2.4 * MM, 2.4 * MM, 1.6 * MM, 12).toNonIndexed(), T(cx + Math.cos(a) * 3.2 * MM, Y + 1 * PLATE, cz + Math.sin(a) * 3.2 * MM), C.yellow);
  }
  b.geometry(new THREE.CylinderGeometry(2.6 * MM, 2.6 * MM, 2.4 * MM, 14).toNonIndexed(), T(cx, Y + 1 * PLATE + 0.6 * MM, cz), C.yellow);
  b.geometry(new THREE.CylinderGeometry(0.8 * MM, 0.8 * MM, 1 * PLATE, 8).toNonIndexed(), T(cx, Y + 0.5 * PLATE, cz), C.green);
}

function frontDoor() {
  // yellow door panel with a four-pane window and a knob; hinge at local x = 0
  const g = new THREE.Group();
  const W = 2.5 * STUD, H = 16.5 * PLATE, D = 0.22 * STUD;
  const mat = plastic(C.yellow);
  const panelLow = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.48, D), mat);
  panelLow.position.set(W / 2, H * 0.24, 0);
  const frameTop = new THREE.Group();
  const bars = [[W / 2, H * 0.98, W, H * 0.04], [W / 2, H * 0.5, W, H * 0.04], [W * 0.04, H * 0.74, W * 0.08, H * 0.5], [W * 0.96, H * 0.74, W * 0.08, H * 0.5], [W / 2, H * 0.74, W * 0.05, H * 0.5], [W / 2, H * 0.74, W, H * 0.03]];
  for (const [x, y, w, h] of bars) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, D), mat); m.position.set(x, y, 0); m.castShadow = true; frameTop.add(m); }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, H * 0.46, D * 0.3), new THREE.MeshPhysicalNodeMaterial({ color: 0xffffff, transmission: 1, roughness: 0.05, ior: 1.5, thickness: 0.02 }));
  glass.position.set(W / 2, H * 0.74, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(1.6 * MM, 12, 8), plastic(C.reddishBrown));
  knob.position.set(W * 0.86, H * 0.42, D * 0.7);
  const knob2 = knob.clone(); knob2.position.z = -D * 0.7;
  panelLow.castShadow = panelLow.receiveShadow = true;
  g.add(panelLow, frameTop, glass, knob, knob2);
  return g;
}

function jailDoor() {
  // grey barred door, hinge at local z = 0, extends along +z
  const g = new THREE.Group();
  const L = 3.5 * STUD, H = 16 * PLATE;
  const mat = plastic(C.lightBluishGrey);
  for (const y of [0.4 * PLATE, H - 0.4 * PLATE, H * 0.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 * STUD, 0.8 * PLATE, L), mat); m.position.set(0, y, L / 2); m.castShadow = true; g.add(m); }
  for (const z of [0.15, 0.85]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 * STUD, H, 0.3 * STUD), mat); m.position.set(0, H / 2, L * z + (z < 0.5 ? -0.3 : 0.3) * STUD); m.castShadow = true; g.add(m); }
  for (let i = 1; i < 6; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, H, 8), mat); m.position.set(0, H / 2, (L * i) / 6); m.castShadow = true; g.add(m); }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(1.6 * MM, 10, 8), plastic(C.reddishBrown));
  knob.position.set(0.35 * STUD, H * 0.45, L * 0.85);
  g.add(knob);
  return g;
}

function dartboard() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const cols = ['#c91a09', '#f4f4f2', '#c91a09', '#f4f4f2', '#c91a09'];
  cols.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 62 - i * 12, 0, Math.PI * 2); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(7.6 * MM, 7.6 * MM, 1.2 * MM, 32), [plastic(C.white), new THREE.MeshPhysicalNodeMaterial({ map: t, roughness: 0.3, clearcoat: 0.2 }), plastic(C.white)]);
  m.rotation.z = Math.PI / 2;
  m.castShadow = true;
  const g2 = new THREE.Group(); g2.add(m);
  return g2;
}
