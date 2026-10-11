import * as THREE from 'three/webgpu';
import { float, vec3, positionWorld, mx_noise_float, time, uniform, color as tslColor } from 'three/tsl';

// ABS plastic. Roughness wanders a little across the surface (moulding marks, handling), which is most of what
// separates a toy from a CG box under a sharp highlight.
const cache = new Map();

export function plastic(hex) {
  const key = 'p' + hex;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: hex,
    metalness: 0,
    roughness: 0.3,
    ior: 1.55,
    clearcoat: 0.22,
    clearcoatRoughness: 0.16,
    specularIntensity: 0.7,
  });
  m.roughnessNode = float(0.24).add(mx_noise_float(positionWorld.mul(7.0)).mul(0.07));
  m.name = 'plastic-' + hex.toString(16);
  cache.set(key, m);
  return m;
}

// Transparent plastic (clear lamps, trans-light-blue water plates, windows).
export function transPlastic(hex, opts = {}) {
  const key = 't' + hex + (opts.key || '');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: hex,
    metalness: 0,
    roughness: 0.05,
    transmission: 1,
    ior: 1.58,
    thickness: opts.thickness ?? 0.2,
    attenuationColor: hex,
    attenuationDistance: opts.attenuation ?? 0.6,
    specularIntensity: 1,
  });
  m.name = 'trans-' + hex.toString(16);
  cache.set(key, m);
  return m;
}

// Light sources made of trans parts (flames, lantern jewels). `power` is shared by everything lit by one switch.
export const lightsPower = {
  torches: uniform(1),
  lanterns: uniform(1),
  campfire: uniform(1),
  lamps: uniform(0),
  volcano: uniform(1),
};

export function glow(hex, group = 'torches', strength = 3) {
  const key = 'g' + hex + group + strength;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.88 });
  const flicker = float(0.82).add(mx_noise_float(vec3(time.mul(7.0), positionWorld.y.mul(4.0), positionWorld.x.mul(3.0))).mul(0.35));
  m.emissiveNode = tslColor(hex).mul(lightsPower[group]).mul(flicker).mul(strength);
  m.name = 'glow-' + group;
  cache.set(key, m);
  return m;
}

export function rubber(hex = 0x1b2a34) {
  const key = 'r' + hex;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshPhysicalNodeMaterial({ color: hex, metalness: 0, roughness: 0.75, ior: 1.5 });
  cache.set(key, m);
  return m;
}
