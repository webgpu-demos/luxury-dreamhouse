import * as THREE from 'three/webgpu';
import { STUD, PLATE, MM, C, params } from '../config.js';
import { buildHouse, cellToLocal } from '../house/house.js';
import { buildIsland, PLATEAU, WATER_Y, ZONES } from '../world/island.js';
import { buildMinifig, FIGURES, SIT_HIP } from '../figures/minifig.js';
import { buildCreature } from '../creatures/creatures.js';
import { kart as buildKart } from '../bricks/parts.js';
import { lightsPower } from '../bricks/materials.js';
import { Walker } from './physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const KART_LIFT = 0.36; // collider half-height + controller offset: body centre above the wheels' contact
const ORDER = ['hugo', 'dada', 'princess', 'blocky'];
const PARTNER_SEAT = { diningSouth: 'diningNorth', diningNorth: 'diningSouth' };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

export class Game {
  constructor({ scene, camera, physics, input, hud, sky, post }) {
    Object.assign(this, { scene, camera, physics, input, hud, sky, post });
    this.time = 0;
    this.playing = false;
    this.cam = { yaw: Math.PI, pitch: 0.32, dist: 6.5, target: new THREE.Vector3(), smoothed: new THREE.Vector3() };
    this.anims = []; // hinge animations
    this.found = new Set();
    this.asBuilt = false;
  }

  build() {
    const { scene, physics } = this;
    // ---- island
    this.island = buildIsland();
    scene.add(this.island.group);
    physics.heightfield(this.island.grid, this.island.H);
    for (const b of this.island.boxes) physics.box(b.min, b.max);
    for (const p of this.island.palms) physics.cylinder(p.x, p.y, p.z, 0.16 * p.s, 3.6 * p.s);

    // ---- house on the plateau
    this.house = buildHouse();
    this.origin = new THREE.Vector3(-23.5 * STUD, PLATEAU + PLATE, -16 * STUD);
    this.house.group.position.copy(this.origin);
    scene.add(this.house.group);
    this.house.group.updateMatrixWorld(true);
    const o = this.origin;
    const toWorld = (v) => v.clone().add(o);
    for (const b of this.house.boxes) physics.box([b.min[0] + o.x, b.min[1] + o.y, b.min[2] + o.z], [b.max[0] + o.x, b.max[1] + o.y, b.max[2] + o.z]);
    this.extColliders = this.house.extBoxes.map((b) => physics.box([b.min[0] + o.x, b.min[1] + o.y, b.min[2] + o.z], [b.max[0] + o.x, b.max[1] + o.y, b.max[2] + o.z]));
    for (const m of this.house.movers) physics.mover(m.object, m.half, m.offset);
    this.seats = {};
    for (const [k, s] of Object.entries(this.house.seats)) this.seats[k] = { ...s, pos: toWorld(s.local), occupant: null };

    // ---- interactables
    this.interactables = [];
    for (const it of this.house.interact) this.interactables.push({ ...it, pos: toWorld(it.local) });
    for (const it of this.island.interact) this.interactables.push({ ...it });

    // ---- light pool: a fixed set of point lights assigned to the nearest sources (no shader recompiles)
    this.lightSources = [
      ...this.house.lights.map((l) => ({ ...l, pos: toWorld(l.local) })),
      ...this.island.lights,
    ];
    this.pool = [];
    for (let i = 0; i < 8; i++) {
      const L = new THREE.PointLight(0xffa040, 0, 8, 1.6);
      L.position.set(0, -100, 0);
      scene.add(L);
      this.pool.push(L);
    }

    // ---- figures
    this.chars = {};
    for (const key of ORDER) {
      const fig = buildMinifig(key);
      scene.add(fig.root);
      const w = new Walker(physics, { radius: 0.3, height: 1.8 });
      this.chars[key] = { key, fig, walker: w, mode: 'walk', seat: null, yaw: 0, speed: 0, stuck: 0, talk: 0 };
    }
    // as built: Hugo and Dada at the table, Blocky on the throne, the princess by the palm
    this.sit(this.chars.hugo, 'diningSouth');
    this.sit(this.chars.dada, 'diningNorth');
    this.sit(this.chars.blocky, 'throne');
    const ps = this.house.spots.princess;
    const pp = toWorld(ps.local);
    this.chars.princess.walker.teleport(pp.x, pp.y + 0.05, pp.z);
    this.chars.princess.yaw = ps.yaw;
    this.chars.princess.home = pp.clone();
    this.player = this.chars.hugo;

    // ---- kart: wheels are an extension; parked in the garage bay (as built it sits in the dining room)
    this.kart = this.makeKart(toWorld(cellToLocal(4.5, 37, 0)).setY(PLATEAU + PLATE), 0);

    // ---- creatures
    this.creatures = [];
    const sp = this.house.spots;
    for (const kind of ['triceratops', 'ankylosaur', 'raptor', 'fox']) {
      const p = toWorld(sp[kind].local);
      this.addCreature(kind, p, sp[kind].yaw, kind === 'raptor' || kind === 'fox' ? 22 : 9);
    }
    const jd = this.island.spawn.dino;
    ['triceratops', 'ankylosaur', 'raptor'].forEach((k, i) => {
      const y = this.island.heightAt(jd[i].x, jd[i].z);
      this.addCreature(k, new THREE.Vector3(jd[i].x, y, jd[i].z), i, 26);
    });

    this.hud.setChests(0, this.island.chests.length);
    this.updateHud();
  }

  addCreature(kind, pos, yaw, roam) {
    const c = buildCreature(kind);
    this.scene.add(c.root);
    const w = new Walker(this.physics, { radius: c.radius, height: c.seatY + 0.2, step: 0.5, x: pos.x, y: pos.y + 0.05, z: pos.z });
    const cr = { c, walker: w, yaw, home: pos.clone(), roam, target: null, wait: Math.random() * 3, rider: null };
    this.creatures.push(cr);
    return cr;
  }

  makeKart(pos, yaw) {
    const g = buildKart();
    this.scene.add(g);
    const R = this.physics.R;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + KART_LIFT + 0.05, pos.z));
    const col = this.physics.world.createCollider(R.ColliderDesc.cuboid(0.72, 0.32, 1.25).setTranslation(0, 0, 0.1), body);
    const ctrl = this.physics.world.createCharacterController(0.04);
    ctrl.enableAutostep(0.32, 0.3, false);
    ctrl.enableSnapToGround(0.5);
    ctrl.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    const k = { group: g, body, col, ctrl, yaw, speed: 0, vy: 0, steer: 0, pos: pos.clone(), pitch: 0, roll: 0, driver: null, passenger: null, home: pos.clone(), homeYaw: yaw, wheelSpin: 0 };
    g.position.copy(pos);
    g.rotation.y = yaw;
    return k;
  }

  // ---------- seats
  sit(ch, seatName) {
    const s = this.seats[seatName];
    if (!s || (s.occupant && s.occupant !== ch)) return false;
    s.occupant = ch;
    ch.seat = seatName;
    ch.mode = s.kind === 'sleep' ? 'sleep' : 'seat';
    ch.walker.setEnabled(false);
    ch.yaw = s.yaw;
    return true;
  }

  standUp(ch) {
    const s = this.seats[ch.seat];
    if (s) s.occupant = null;
    ch.seat = null;
    ch.mode = 'walk';
    const p = this.freeSpotNear(s ? s.pos : ch.fig.root.position, ch.yaw, ch);
    ch.walker.teleport(p.x, p.y + 0.05, p.z);
    ch.walker.setEnabled(true);
    ch.fig.root.rotation.set(0, ch.yaw, 0);
  }

  // somewhere to stand near `c`: try in front, behind, to the sides, then further out
  freeSpotNear(c, yaw, ch) {
    const ignore = new Set([ch?.walker.collider.handle]);
    for (const r of [0.85, 1.2, 1.7, 2.4, 3.2]) {
      for (const a of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
        const x = c.x + Math.sin(yaw + a) * r, z = c.z + Math.cos(yaw + a) * r;
        const gy = this.physics.groundY(x, z, c.y + 1.2);
        if (gy === null || gy > c.y + 0.5) continue;
        if (this.physics.isFree(x, gy, z, 0.3, 1.8, ignore)) return new THREE.Vector3(x, gy, z);
      }
    }
    const gy = this.physics.groundY(c.x, c.z, c.y + 3) ?? c.y;
    return new THREE.Vector3(c.x, gy, c.z);
  }

  placeSeated(ch) {
    const s = this.seats[ch.seat];
    const fwd = tmp.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    const r = ch.fig.root;
    if (ch.mode === 'sleep') {
      r.position.copy(s.pos).add(new THREE.Vector3(0, 4.2 * MM, 0));
      r.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      r.rotation.y = s.yaw;
      r.position.addScaledVector(fwd, -0.7);
      ch.fig.state = 'idle';
    } else {
      r.position.copy(s.pos).addScaledVector(fwd, -0.12);
      r.position.y -= SIT_HIP;
      r.rotation.set(0, s.yaw, 0);
      ch.fig.state = 'sit';
    }
  }

  // ---------- main loop
  update(dt) {
    this.time += dt;
    const inp = this.input;
    if (this.playing) this.handleGlobalKeys();

    // player
    const P = this.player;
    if (this.playing) this.controlPlayer(P, dt);

    // other characters
    for (const ch of Object.values(this.chars)) {
      if (ch === P && this.playing) continue;
      this.updateNpc(ch, dt);
    }
    // creatures
    for (const cr of this.creatures) this.updateCreature(cr, dt);
    // kart (no driver: settle)
    if (!this.kart.driver) this.driveKart(this.kart, 0, 0, false, dt);

    this.physics.syncMovers();
    this.physics.step(dt);

    // sync figures to their walkers
    for (const ch of Object.values(this.chars)) this.syncFigure(ch, dt);

    // hinge animations
    for (const a of this.anims) {
      const cur = a.pivot.rotation[a.axis];
      a.pivot.rotation[a.axis] = cur + (a.to - cur) * (1 - Math.exp(-dt * 7));
    }
    this.updateLights();
    this.updateCamera(dt);
    if (this.playing) this.updatePrompt();
    this.zoneCheck();
  }

  handleGlobalKeys() {
    const inp = this.input;
    if (inp.hit('Tab')) this.switchCharacter();
    if (inp.hit('KeyN')) { this.sky.setHours(this.sky.night > 0.5 ? 9.5 : 20.5); this.hud.toast(this.sky.night > 0.5 ? 'Good morning' : 'Good night'); }
    if (inp.hit('KeyT')) this.sky.setHours(this.sky.hours + 1);
    if (inp.hit('KeyB')) this.toggleAsBuilt();
    if (inp.hit('KeyH')) this.hud.toggleHelp();
    if (inp.hit('KeyQ')) this.cycleQuality();
    if (inp.hit('KeyP')) { this.post.setDof(!this.post.dofOn); this.hud.toast(this.post.dofOn ? 'Photo mode: macro focus on' : 'Photo mode off'); }
    if (inp.hit('KeyR')) this.respawn();
  }

  cycleQuality() {
    const tiers = ['low', 'medium', 'high'];
    const t = tiers[(tiers.indexOf(this.post.tier) + 1) % 3];
    this.post.setTier(t);
    this.hud.toast('Quality: ' + t);
  }

  toggleAsBuilt() {
    this.asBuilt = !this.asBuilt;
    this.house.extGroup.visible = !this.asBuilt;
    for (const c of this.extColliders) c && c.setEnabled(!this.asBuilt);
    for (const w of this.kart.group.userData.wheels) w.steer.visible = !this.asBuilt;
    this.hud.toast(this.asBuilt ? 'As built: extensions hidden (kart wheels, driveway, garage)' : 'Extensions shown');
  }

  respawn() {
    const P = this.player;
    if (P.mode === 'drive') this.exitKart(P);
    if (P.mode === 'seat' || P.mode === 'sleep') this.standUp(P);
    if (P.mode === 'ride') this.dismount(P);
    const p = this.origin.clone().add(cellToLocal(29, 34, 0));
    P.walker.teleport(p.x, PLATEAU + 0.3, p.z);
    this.hud.toast('Back to the front door');
  }

  switchCharacter() {
    const P = this.player;
    if (P.mode === 'drive' || P.mode === 'ride') { this.hud.toast('Hop off first (E)'); return; }
    const next = this.chars[ORDER[(ORDER.indexOf(P.key) + 1) % ORDER.length]];
    this.player = next;
    if (next.mode === 'seat' || next.mode === 'sleep') this.standUp(next);
    this.cam.yaw = next.yaw + Math.PI * 0; // keep looking the way they face
    this.updateHud();
  }

  updateHud() {
    const s = FIGURES[this.player.key];
    this.hud.setCharacter(s.name, s.role);
  }

  // ---------- player control
  controlPlayer(P, dt) {
    const inp = this.input;
    const ax = inp.axes();
    // camera orbit
    this.cam.yaw -= inp.dx * 0.0026;
    this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + inp.dy * 0.0022, -0.25, 1.2);
    this.cam.dist = THREE.MathUtils.clamp(this.cam.dist * (1 + inp.wheel * 0.1), 2.2, 22);
    const yaw = this.cam.yaw;
    const fwd = tmp.set(Math.sin(yaw), 0, Math.cos(yaw));
    const right = tmp2.set(-Math.cos(yaw), 0, Math.sin(yaw));

    if (P.mode === 'seat' || P.mode === 'sleep') {
      if (inp.hit('KeyE') || (P.mode === 'sleep' && (ax.x || ax.y))) this.standUp(P);
      return;
    }
    if (P.mode === 'drive') {
      this.driveKart(this.kart, ax.y, -ax.x, inp.down('Space'), dt);
      if (inp.hit('KeyE')) this.exitKart(P);
      return;
    }
    if (P.mode === 'ride') {
      const cr = P.mount;
      const run = inp.down('ShiftLeft', 'ShiftRight');
      const v = new THREE.Vector3().addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
      const sp = cr.c.speed * (run ? 1.6 : 1);
      cr.walker.move(v.x * sp, v.z * sp, dt, inp.hit('Space'), WATER_Y);
      if (v.lengthSq() > 0.01) cr.yaw = lerpAngle(cr.yaw, Math.atan2(v.x, v.z), 1 - Math.exp(-dt * 8));
      cr.moving = v.length() * sp;
      if (inp.hit('KeyE')) this.dismount(P);
      return;
    }
    // walking
    const run = inp.down('ShiftLeft', 'ShiftRight');
    const sp = run ? 6.8 : 3.4;
    const v = new THREE.Vector3().addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    const jump = inp.hit('Space');
    P.walker.move(v.x * sp, v.z * sp, dt, jump, WATER_Y);
    P.speed = v.length() * sp;
    if (v.lengthSq() > 0.01) P.yaw = lerpAngle(P.yaw, Math.atan2(v.x, v.z), 1 - Math.exp(-dt * 12));
    P.fig.state = !P.walker.grounded ? 'jump' : P.speed > 4.5 ? 'run' : P.speed > 0.2 ? 'walk' : 'idle';
    if (inp.hit('KeyE') && this.current) this.activate(this.current);
  }

  // ---------- NPCs and the companion
  updateNpc(ch, dt) {
    if (ch.mode === 'seat' || ch.mode === 'sleep') {
      // the companion leaves the table when the player walks away
      if (this.playing && this.isCompanion(ch) && this.player.mode === 'walk' && this.player.seat === null) {
        const d = ch.fig.root.position.distanceTo(this.player.walker.pos);
        if (d > 3.5) this.standUp(ch);
      }
      return;
    }
    if (ch.mode === 'drive' || ch.mode === 'passenger') return;
    if (this.playing && this.isCompanion(ch)) return this.followPlayer(ch, dt);
    // idle NPC: drift back home slowly
    let vx = 0, vz = 0;
    if (ch.home) {
      const d = tmp.copy(ch.home).sub(ch.walker.pos).setY(0);
      if (d.length() > 1.2) { d.normalize().multiplyScalar(2); vx = d.x; vz = d.z; ch.yaw = lerpAngle(ch.yaw, Math.atan2(vx, vz), 0.1); }
    }
    ch.walker.move(vx, vz, dt, false, WATER_Y);
    ch.speed = Math.hypot(vx, vz);
    ch.fig.state = ch.speed > 0.2 ? 'walk' : 'idle';
  }

  isCompanion(ch) {
    const p = this.player.key;
    return (p === 'hugo' && ch.key === 'dada') || (p === 'dada' && ch.key === 'hugo');
  }

  followPlayer(ch, dt) {
    const P = this.player;
    // join the player at the table
    if (P.mode === 'seat' && PARTNER_SEAT[P.seat]) {
      const seat = this.seats[PARTNER_SEAT[P.seat]];
      if (!seat.occupant && ch.walker.pos.distanceTo(seat.pos) < 12) {
        const to = tmp.copy(seat.pos).sub(ch.walker.pos).setY(0);
        if (to.length() < 1.3) { this.sit(ch, PARTNER_SEAT[P.seat]); return; }
        return this.steer(ch, to, 3.4, dt);
      }
    }
    // ride along in the kart
    if (P.mode === 'drive' && !this.kart.passenger) {
      const kp = this.kart.pos;
      const to = tmp.copy(kp).sub(ch.walker.pos).setY(0);
      if (to.length() < 2.6 || (to.length() < 14 && ch.stuck > 2.5)) { this.board(ch); return; }
      if (to.length() < 30) return this.steer(ch, to, 6.5, dt);
    }
    const target = P.mode === 'ride' ? P.mount.walker.pos : P.walker.pos;
    const to = tmp.copy(target).sub(ch.walker.pos);
    const dist = to.setY(0).length();
    if (dist > 45 || (ch.stuck > 4 && dist > 4)) {
      const behind = new THREE.Vector3(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw)).multiplyScalar(-2.2).add(target);
      const gy = this.physics.groundY(behind.x, behind.z, target.y + 4) ?? target.y;
      ch.walker.teleport(behind.x, gy + 0.1, behind.z);
      ch.stuck = 0;
      return;
    }
    if (dist < 2.4) {
      ch.walker.move(0, 0, dt, false, WATER_Y);
      ch.speed = 0;
      ch.fig.state = 'idle';
      ch.yaw = lerpAngle(ch.yaw, Math.atan2(to.x, to.z), 1 - Math.exp(-dt * 4));
      ch.stuck = 0;
      return;
    }
    this.steer(ch, to, dist > 7 ? 6.8 : 3.6, dt);
  }

  steer(ch, to, speed, dt) {
    const d = to.clone().setY(0).normalize();
    const moved = ch.walker.move(d.x * speed, d.z * speed, dt, ch.stuck > 1.2 && ch.walker.grounded && Math.random() < 0.05, WATER_Y);
    ch.speed = moved / Math.max(dt, 1e-4);
    ch.stuck = ch.speed < speed * 0.25 ? ch.stuck + dt : Math.max(0, ch.stuck - dt * 2);
    ch.yaw = lerpAngle(ch.yaw, Math.atan2(d.x, d.z), 1 - Math.exp(-dt * 10));
    ch.fig.state = ch.speed > 4.5 ? 'run' : ch.speed > 0.2 ? 'walk' : 'idle';
  }

  syncFigure(ch, dt) {
    const r = ch.fig.root;
    if (ch.mode === 'seat' || ch.mode === 'sleep') this.placeSeated(ch);
    else if (ch.mode === 'drive' || ch.mode === 'passenger') {
      const k = this.kart;
      const local = new THREE.Vector3(ch.mode === 'drive' ? -STUD : STUD, 4 * PLATE - SIT_HIP + 0.02, -1 * STUD + 0.05);
      local.applyQuaternion(k.group.quaternion);
      r.position.copy(k.group.position).add(local);
      r.quaternion.copy(k.group.quaternion);
      ch.fig.state = ch.mode === 'drive' ? 'drive' : 'sit';
    } else if (ch.mode === 'ride') {
      const cr = ch.mount;
      r.position.copy(cr.c.root.position).add(new THREE.Vector3(0, cr.c.seatY - SIT_HIP * 0.6, 0));
      r.rotation.set(0, cr.yaw, 0);
      ch.fig.state = 'ride';
    } else {
      r.position.copy(ch.walker.pos);
      r.rotation.set(0, ch.yaw, 0);
    }
    ch.fig.animate(dt, ch.speed);
  }

  // ---------- creatures
  updateCreature(cr, dt) {
    if (cr.rider) {
      cr.c.root.position.copy(cr.walker.pos);
      cr.c.root.rotation.y = cr.yaw;
      cr.c.animate(dt, cr.moving || 0);
      return;
    }
    cr.wait -= dt;
    let vx = 0, vz = 0;
    if (cr.target) {
      const to = tmp.copy(cr.target).sub(cr.walker.pos).setY(0);
      if (to.length() < 1.0 || cr.wait < -14) { cr.target = null; cr.wait = 2 + Math.random() * 5; }
      else { to.normalize().multiplyScalar(cr.c.speed * 0.45); vx = to.x; vz = to.z; cr.yaw = lerpAngle(cr.yaw, Math.atan2(vx, vz), 1 - Math.exp(-dt * 3)); }
    } else if (cr.wait < 0 && this.playing) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * cr.roam;
      cr.target = cr.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      cr.wait = 0;
    }
    const moved = cr.walker.move(vx, vz, dt, false, WATER_Y);
    const v = moved / Math.max(dt, 1e-4);
    if (cr.target && v < 0.1 && cr.wait < -2) cr.target = null;
    cr.c.root.position.copy(cr.walker.pos);
    cr.c.root.rotation.y = cr.yaw;
    cr.c.animate(dt, v);
  }

  mount(ch, cr) {
    ch.mode = 'ride';
    ch.mount = cr;
    cr.rider = ch;
    ch.walker.setEnabled(false);
    this.hud.toast(`Riding the ${cr.c.kind}. E to hop off, Shift to gallop`);
  }

  dismount(ch) {
    const cr = ch.mount;
    cr.rider = null;
    ch.mount = null;
    ch.mode = 'walk';
    const spot = this.freeSpotNear(cr.walker.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), cr.yaw + Math.PI / 2, ch);
    ch.walker.teleport(spot.x, spot.y + 0.05, spot.z);
    ch.walker.setEnabled(true);
    ch.yaw = cr.yaw;
  }

  // ---------- kart
  board(ch) {
    if (this.kart.passenger) return;
    this.kart.passenger = ch;
    ch.mode = 'passenger';
    ch.walker.setEnabled(false);
  }

  enterKart(ch) {
    const k = this.kart;
    k.driver = ch;
    ch.mode = 'drive';
    ch.walker.setEnabled(false);
    this.cam.yaw = k.yaw;
    // the companion hops in if he's anywhere close
    const mate = Object.values(this.chars).find((c) => this.isCompanion(c));
    let msg = 'W/S drive, A/D steer, Space handbrake, E to get out';
    if (mate && !k.passenger && mate.mode === 'walk' && mate.walker.pos.distanceTo(k.pos) < 16) { this.board(mate); msg = `${FIGURES[mate.key].name} jumps in! ` + msg; }
    this.hud.toast(msg);
  }

  exitKart(ch) {
    const k = this.kart;
    for (const who of [k.driver, k.passenger]) {
      if (!who) continue;
      const side = who === k.driver ? -1 : 1;
      const out = new THREE.Vector3(side * 1.6, 0.3, -0.3).applyQuaternion(k.group.quaternion).add(k.pos);
      const spot = this.freeSpotNear(out, k.yaw + side * Math.PI / 2, who);
      who.mode = 'walk';
      who.walker.teleport(spot.x, spot.y + 0.05, spot.z);
      who.walker.setEnabled(true);
      who.yaw = k.yaw;
    }
    k.driver = null; k.passenger = null; k.speed = 0;
  }

  driveKart(k, throttle, steer, brake, dt) {
    const max = 17, accel = 9, rev = 6;
    if (throttle > 0) k.speed += accel * throttle * dt * (k.speed < 0 ? 2.5 : 1);
    else if (throttle < 0) k.speed += (k.speed > 0.3 ? -14 : -rev) * -throttle * dt;
    else k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 3.5 * dt);
    if (brake) k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 22 * dt);
    k.speed = THREE.MathUtils.clamp(k.speed, -7, max);
    k.steer += (steer - k.steer) * (1 - Math.exp(-dt * 8));
    const grip = 1.9 * (1 - 0.45 * Math.min(1, Math.abs(k.speed) / max));
    k.yaw += k.steer * grip * THREE.MathUtils.clamp(k.speed / 5, -1, 1) * dt;
    k.vy -= 18 * dt;
    const fwd = new THREE.Vector3(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    const desired = { x: fwd.x * k.speed * dt, y: k.vy * dt, z: fwd.z * k.speed * dt };
    const ignore = new Set([k.col.handle]);
    for (const who of [k.driver, k.passenger]) if (who) ignore.add(who.walker.collider.handle);
    k.ctrl.computeColliderMovement(k.col, desired, undefined, undefined, (c) => !ignore.has(c.handle));
    const m = k.ctrl.computedMovement();
    const t = k.body.translation();
    const grounded = k.ctrl.computedGrounded();
    if (grounded && k.vy < 0) k.vy = -1;
    const horiz = Math.hypot(m.x, m.z), want = Math.abs(k.speed * dt);
    if (want > 0.02 && horiz < want * 0.35) k.speed *= 0.6; // bumped into something
    const nt = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    // into the sea: fish it out and put it back on the road
    if (nt.y - KART_LIFT < WATER_Y - 0.5) {
      const p = this.island.loop[0];
      const near = this.island.loop.reduce((best, q) => (Math.hypot(q.x - nt.x, q.z - nt.z) < Math.hypot(best.x - nt.x, best.z - nt.z) ? q : best), p);
      nt.x = near.x; nt.z = near.z; nt.y = this.island.heightAt(near.x, near.z) + KART_LIFT + 0.2; k.speed = 0; k.vy = 0;
      this.hud.toast('Splash! Kart back on the road');
    }
    k.body.setNextKinematicTranslation(nt);
    k.body.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(UP, k.yaw));
    k.pos.set(nt.x, nt.y - KART_LIFT, nt.z);
    // visual: pitch/roll from the ground under the wheels
    const h = (dx, dz) => this.physics.groundY(k.pos.x + dx, k.pos.z + dz, k.pos.y + 2) ?? k.pos.y;
    const fx = fwd.x * 0.9, fz = fwd.z * 0.9, rx = fwd.z * 0.6, rz = -fwd.x * 0.6;
    const pitch = Math.atan2(h(fx, fz) - h(-fx, -fz), 1.8), roll = Math.atan2(h(rx, rz) - h(-rx, -rz), 1.2);
    k.pitch += (THREE.MathUtils.clamp(pitch, -0.5, 0.5) - k.pitch) * (1 - Math.exp(-dt * 10));
    k.roll += (THREE.MathUtils.clamp(roll, -0.4, 0.4) - k.roll) * (1 - Math.exp(-dt * 10));
    k.group.position.copy(k.pos);
    k.group.rotation.set(-k.pitch, k.yaw, k.roll, 'YXZ');
    k.wheelSpin += (k.speed * dt) / (7 * MM);
    for (const w of k.group.userData.wheels) { w.wheel.rotation.x = k.wheelSpin; if (w.front) w.steer.rotation.y = k.steer * 0.45; }
  }

  // ---------- interaction
  updatePrompt() {
    const P = this.player;
    let best = null, bd = Infinity;
    if (P.mode === 'walk') {
      const pos = P.walker.pos;
      const consider = (it, d) => { if (d < it.radius && d < bd) { bd = d; best = it; } };
      for (const it of this.interactables) consider(it, tmp.copy(it.pos).sub(pos).setY(0).length() + Math.max(0, Math.abs(it.pos.y - pos.y) - 2.5));
      const kd = this.kart.pos.distanceTo(pos);
      if (!this.kart.driver) consider({ id: 'kart', label: 'Drive the kart', radius: 2.8, kind: 'kart' }, kd);
      for (const cr of this.creatures) if (cr.c.rideable && !cr.rider) consider({ id: 'ride', label: `Ride the ${cr.c.kind}`, radius: 2.6, kind: 'ride', data: cr }, cr.walker.pos.distanceTo(pos) - 0.6);
      for (const ch of Object.values(this.chars)) if (ch !== P && ch.mode === 'walk') consider({ id: 'talk', label: `Talk to ${FIGURES[ch.key].name}`, radius: 2.2, kind: 'talk', data: ch }, ch.walker.pos.distanceTo(pos));
      for (const ch of Object.values(this.chars)) if (ch !== P && ch.mode === 'seat') consider({ id: 'talk', label: `Talk to ${FIGURES[ch.key].name}`, radius: 2.0, kind: 'talk', data: ch }, ch.fig.root.position.distanceTo(pos));
    }
    this.current = best;
    const hint = P.mode === 'seat' ? 'E  Stand up' : P.mode === 'drive' ? 'E  Get out' : P.mode === 'ride' ? 'E  Hop off' : P.mode === 'sleep' ? 'E  Wake up' : null;
    this.hud.prompt(best ? 'E  ' + best.label : hint);
  }

  activate(it) {
    const P = this.player;
    if (it.kind === 'hinge' || it.kind === 'treasure') {
      let a = this.anims.find((x) => x.pivot === it.data.pivot);
      if (!a) { a = { pivot: it.data.pivot, axis: it.data.axis, to: 0, open: false }; this.anims.push(a); }
      a.open = !a.open;
      a.to = a.open ? it.data.open : 0;
      if (it.kind === 'treasure' && a.open && !this.found.has(it.id)) {
        this.found.add(it.id);
        this.hud.setChests(this.found.size, this.island.chests.length);
        this.hud.toast(this.found.size === this.island.chests.length ? 'All the treasure on Dreamhouse Island!' : `Treasure! ${this.found.size} of ${this.island.chests.length}`);
      }
    } else if (it.kind === 'seat' || it.kind === 'sleep') {
      const s = this.seats[it.data.seat];
      if (s.occupant && s.occupant !== P) {
        const o = s.occupant;
        if (o.key === 'blocky' || !this.isCompanion(o)) { this.standUp(o); o.home = o.walker.pos.clone(); }
        else { this.hud.toast(`${FIGURES[o.key].name} is sitting there`); return; }
      }
      this.sit(P, it.data.seat);
      if (it.kind === 'sleep') {
        this.hud.fade(() => { this.sky.setHours(this.sky.night > 0.5 ? 8.0 : 21.0); });
        this.hud.toast('Zzz…');
      }
    } else if (it.kind === 'light') {
      const g = lightsPower[it.data.group];
      g.value = g.value > 0.5 ? 0 : 1;
      if (it.data.group === 'lamps') this.sky.lampsOverride = g.value;
    } else if (it.kind === 'kart') {
      this.enterKart(P);
    } else if (it.kind === 'ride') {
      this.mount(P, it.data);
    } else if (it.kind === 'talk') {
      const lines = {
        hugo: ['Burger night!', 'Race you round the island?', 'Did you find the treasure in the jungle?'],
        dada: ['Can I drive the kart?', 'The volcano is SO cool.', 'Let’s ride the triceratops!'],
        princess: ['Welcome to the Luxury Dream House!', 'There are nine treasure chests on the island.', 'The lookout on the point has the best view.'],
        blocky: ['This is MY throne.', 'Cluck.', 'Have you looked inside the chicken?'],
      }[it.data.key];
      it.data.talk = (it.data.talk + 1) % lines.length;
      this.hud.toast(`${FIGURES[it.data.key].name}: “${lines[it.data.talk]}”`);
    }
  }

  zoneCheck() {
    if (!this.playing) return;
    const p = this.player.mode === 'drive' ? this.kart.pos : this.player.mode === 'ride' ? this.player.mount.walker.pos : this.player.walker.pos;
    let z = null;
    for (const v of Object.values(ZONES)) if (Math.hypot(p.x - v.x, p.z - v.z) < v.r * 1.15) { z = v.name; break; }
    if (z !== this.zone) { this.zone = z; if (z) this.hud.zone(z); }
  }

  // ---------- lights: assign the pool to the nearest sources
  updateLights() {
    const focus = this.cam.smoothed;
    if (!this._lt || this.time - this._lt > 0.5) {
      this._lt = this.time;
      this.nearest = [...this.lightSources].sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus)).slice(0, this.pool.length);
    }
    const flick = (i) => 0.85 + 0.15 * Math.sin(this.time * 13 + i * 7) * Math.sin(this.time * 7.3 + i);
    this.pool.forEach((L, i) => {
      const s = this.nearest[i];
      if (!s) { L.intensity = 0; return; }
      L.position.copy(s.pos);
      L.color.setHex(s.color);
      L.distance = s.distance;
      const pw = lightsPower[s.group]?.value ?? 1;
      L.intensity = s.intensity * pw * (s.group === 'lamps' ? 1 : flick(i)) * (1.2 + 2.2 * this.sky.night);
    });
  }

  // ---------- camera
  focusPoint() {
    const P = this.player;
    if (P.mode === 'drive' || P.mode === 'passenger') return tmp.copy(this.kart.pos).add(new THREE.Vector3(0, 1.4, 0));
    if (P.mode === 'ride') return tmp.copy(P.mount.walker.pos).add(new THREE.Vector3(0, P.mount.c.seatY + 1.3, 0));
    return tmp.copy(P.fig.root.position).add(new THREE.Vector3(0, P.mode === 'seat' ? 1.0 : 1.45, 0));
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (!this.playing) {
      // attract mode: slow orbit around the house
      const a = this.time * 0.06 + 2.4;
      const c = new THREE.Vector3(0, PLATEAU + 1.6, 1.0);
      cam.position.set(Math.sin(a) * 17, PLATEAU + 8.5, Math.cos(a) * 17).add(new THREE.Vector3(0, 0, 1));
      cam.lookAt(c);
      this.cam.smoothed.copy(c);
      this.sky.update(c);
      return;
    }
    const target = this.focusPoint().clone();
    const k = 1 - Math.exp(-dt * 10);
    this.cam.smoothed.lerp(target, k);
    const P = this.player;
    if (P.mode === 'drive') {
      // chase camera swings behind the kart
      this.cam.yaw = lerpAngle(this.cam.yaw, this.kart.yaw, 1 - Math.exp(-dt * 2.5 * Math.min(1, Math.abs(this.kart.speed) / 3)));
    }
    const yaw = this.cam.yaw, pitch = this.cam.pitch;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let dist = this.cam.dist * (P.mode === 'drive' ? 1.25 : 1);
    const back = dir.clone().negate();
    const t = this.physics.rayStatic(this.cam.smoothed, back, dist + 0.3);
    if (t !== null) dist = Math.max(0.6, t - 0.3);
    this._camDist = this._camDist === undefined ? dist : this._camDist + (dist - this._camDist) * (dist < this._camDist ? 1 : 1 - Math.exp(-dt * 4));
    cam.position.copy(this.cam.smoothed).addScaledVector(back, this._camDist);
    cam.lookAt(this.cam.smoothed);
    this.post.focus.value = this._camDist;
    this.sky.update(this.cam.smoothed);
  }

  start() {
    this.playing = true;
    const P = this.player;
    if (P.mode === 'seat') this.standUp(P);
    this.cam.yaw = P.yaw;
    this.cam.smoothed.copy(this.focusPoint());
  }
}
