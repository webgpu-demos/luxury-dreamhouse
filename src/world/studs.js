import { positionWorld, normalWorld, cameraPosition, fract, length, smoothstep, float, vec3, clamp, distance, normalize, transformNormalToView, min, abs, mix } from 'three/tsl';
import { STUD, STUD_H } from '../config.js';

// Studs on large surfaces (terrain, water) are shaded, not modelled: an analytic stud height field on the lattice
// gives a normal and a contact ring, faded with distance so it never shimmers. Real stud geometry is reserved for
// the house and props near the camera.
export function studNodes({ near = 9, far = 26, baseplateSeams = true } = {}) {
  const up = smoothstep(0.6, 0.95, normalWorld.y);
  const p = positionWorld.xz.div(STUD);
  const f = fract(p).sub(0.5);
  const d = length(f).max(0.0001);
  const fade = float(1).sub(smoothstep(near, far, distance(cameraPosition, positionWorld)));
  const r0 = 0.31, r1 = 0.27;
  const t = clamp(float(r0).sub(d).div(r0 - r1), 0, 1);
  const dhdd = t.mul(float(1).sub(t)).mul(6).mul(-STUD_H / ((r0 - r1) * STUD));
  const g = f.div(d).mul(dhdd).mul(up).mul(fade).mul(0.65);
  const n = normalize(normalWorld.add(vec3(g.x.negate(), 0, g.y.negate())));
  const normalNode = transformNormalToView(n);
  const studTop = smoothstep(r0, r1, d).mul(up).mul(fade);
  const ring = smoothstep(0.29, 0.335, d).mul(smoothstep(0.43, 0.335, d)).mul(up).mul(fade);
  let shade = float(1).sub(ring.mul(0.2)).add(studTop.mul(0.035));
  if (baseplateSeams) {
    const q = fract(positionWorld.xz.div(STUD * 32));
    const e = min(min(q.x, float(1).sub(q.x)), min(q.y, float(1).sub(q.y))).mul(32 * STUD);
    const seam = float(1).sub(smoothstep(0.0, 0.025, e)).mul(up);
    shade = shade.mul(float(1).sub(seam.mul(0.35)));
  }
  return { normalNode, nWorld: n, shade, studTop, up, fade };
}
