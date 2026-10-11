import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';

// Rapier world: terrain heightfield, static boxes (house, props), kinematic movers (doors), character controllers.
export class Physics {
  async init() {
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.statics = new Set();
    this.movers = [];
    return this;
  }

  heightfield(grid, H) {
    const { nx, nz, cell } = grid;
    // samples at cell centres; rows = z, cols = x, column-major
    const heights = new Float32Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) heights[j + i * nz] = H[i + j * nx];
    const desc = this.R.ColliderDesc.heightfield(nz - 1, nx - 1, heights, { x: (nx - 1) * cell, y: 1, z: (nz - 1) * cell });
    const c = this.world.createCollider(desc);
    this.statics.add(c.handle);
    return c;
  }

  box(min, max) {
    const hx = (max[0] - min[0]) / 2, hy = (max[1] - min[1]) / 2, hz = (max[2] - min[2]) / 2;
    if (hx < 0.005 || hy < 0.005 || hz < 0.005) return null;
    const desc = this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(min[0] + hx, min[1] + hy, min[2] + hz);
    const c = this.world.createCollider(desc);
    this.statics.add(c.handle);
    return c;
  }

  cylinder(x, y, z, r, h) {
    const c = this.world.createCollider(this.R.ColliderDesc.cylinder(h / 2, r).setTranslation(x, y + h / 2, z));
    this.statics.add(c.handle);
    return c;
  }

  // a box that follows a scene object (doors, lids)
  mover(object, half, offset) {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
    const c = this.world.createCollider(this.R.ColliderDesc.cuboid(...half).setTranslation(...offset), body);
    this.statics.add(c.handle);
    this.movers.push({ object, body });
  }

  syncMovers() {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const { object, body } of this.movers) {
      object.updateWorldMatrix(true, false);
      object.matrixWorld.decompose(p, q, s);
      body.setNextKinematicTranslation(p);
      body.setNextKinematicRotation(q);
    }
  }

  step(dt) {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }

  // ray against static geometry only (camera collision, ground probes)
  rayStatic(origin, dir, maxDist) {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined, (c) => this.statics.has(c.handle));
    return hit ? hit.timeOfImpact : null;
  }

  // is a standing figure (capsule) free of static geometry at these feet?
  isFree(x, y, z, radius = 0.3, height = 1.8, ignore = null) {
    const half = height / 2 - radius;
    const shape = new this.R.Capsule(half, radius);
    const hit = this.world.intersectionWithShape({ x, y: y + half + radius + 0.06, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, undefined, undefined, undefined, (c) => c !== ignore && !(ignore && ignore.has && ignore.has(c.handle)));
    return !hit;
  }

  groundY(x, z, fromY = 200) {
    const t = this.rayStatic({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, fromY + 50);
    return t === null ? null : fromY - t;
  }
}

// A walking body: kinematic capsule + character controller. Position is at the feet.
export class Walker {
  constructor(physics, { radius = 0.3, height = 1.8, step = 0.46, x = 0, y = 0, z = 0 } = {}) {
    const R = physics.R;
    this.ph = physics;
    this.radius = radius; this.half = Math.max(0.05, height / 2 - radius);
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + this.half + radius, z));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(this.half, radius), this.body);
    this.ctrl = physics.world.createCharacterController(0.03);
    this.ctrl.enableAutostep(step, 0.15, false);
    this.ctrl.enableSnapToGround(0.45);
    this.ctrl.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((65 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(false);
    this.vy = 0;
    this.grounded = false;
    this.pos = new THREE.Vector3(x, y, z);
    this.lastMove = 0;
  }

  setEnabled(on) { this.collider.setEnabled(on); }

  teleport(x, y, z) {
    this.body.setTranslation({ x, y: y + this.half + this.radius, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + this.half + this.radius, z });
    this.pos.set(x, y, z);
    this.vy = 0;
  }

  // vx, vz: desired horizontal velocity (m/s). Returns horizontal distance actually moved.
  move(vx, vz, dt, jump = false, waterY = -Infinity) {
    if (this.grounded && jump) this.vy = 7.2;
    this.vy -= 18 * dt;
    if (this.grounded && this.vy < 0) this.vy = -2;
    const desired = { x: vx * dt, y: this.vy * dt, z: vz * dt };
    this.ctrl.computeColliderMovement(this.collider, desired, undefined, undefined, (c) => c.handle !== this.collider.handle && !c.__ignore);
    const m = this.ctrl.computedMovement();
    const t = this.body.translation();
    let nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    // swim: keep the head above water
    const feet = ny - this.half - this.radius;
    const swimFloor = waterY - 1.15;
    this.swimming = feet < swimFloor;
    if (this.swimming) { ny = swimFloor + this.half + this.radius; this.vy = Math.max(this.vy, 0); this.grounded = true; }
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pos.set(nx, ny - this.half - this.radius, nz);
    this.lastMove = Math.hypot(m.x, m.z);
    return this.lastMove;
  }
}
