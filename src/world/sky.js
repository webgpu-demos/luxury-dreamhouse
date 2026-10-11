import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { lightsPower } from '../bricks/materials.js';

// Physical sky with procedural clouds, a sun that follows the clock, a moon and stars at night.
export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.hours = 15.5;
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(6000);
    this.sky.turbidity.value = 3.2;
    this.sky.rayleigh.value = 1.1;
    this.sky.mieCoefficient.value = 0.004;
    this.sky.mieDirectionalG.value = 0.82;
    this.sky.cloudCoverage.value = 0.32;
    this.sky.cloudDensity.value = 0.35;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const cam = this.sun.shadow.camera;
    cam.left = -34; cam.right = 34; cam.top = 34; cam.bottom = -34; cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a8a4a, 0.55);
    scene.add(this.hemi);

    this.stars = makeStars();
    scene.add(this.stars);

    this.fog = new THREE.Fog(0xbfd7ea, 140, 620);
    scene.fog = this.fog;

    this.envScene = new THREE.Scene();
    this.envSky = new SkyMesh();
    this.envSky.scale.setScalar(900);
    this.envSky.showSunDisc.value = 0;
    this.envSky.cloudCoverage.value = 0.32;
    this.envScene.add(this.envSky);
    this.pmrem = null;
    this.envTarget = null;
    this.lastEnvHours = -100;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
  }

  setHours(h) { this.hours = ((h % 24) + 24) % 24; }

  sunDirection(h, out) {
    // a tropical day: sunrise ~6, sunset ~18.3, high noon
    const t = (h - 6.15) / 12.15; // 0 at sunrise, 1 at sunset
    const elev = Math.sin(Math.PI * t) * THREE.MathUtils.degToRad(72);
    const az = THREE.MathUtils.degToRad(100) + Math.PI * t * 0.9;
    out.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    return out;
  }

  update(focus) {
    const d = this.sunDirection(this.hours, this.sunDir);
    const elevation = Math.asin(d.y);
    const day = THREE.MathUtils.smoothstep(elevation, -0.06, 0.12);
    this.night = 1 - day;
    this.sky.sunPosition.value.copy(d);
    this.envSky.sunPosition.value.copy(d.y > -0.05 ? d : new THREE.Vector3(d.x, 0.02, d.z));
    // sun or moon drives the shadowing light
    const moonDir = new THREE.Vector3(-d.x, Math.abs(d.y) + 0.35, -d.z).normalize();
    const L = day > 0.02 ? d : moonDir;
    this.sun.position.copy(focus).addScaledVector(L, 120);
    this.sun.target.position.copy(focus);
    const warm = THREE.MathUtils.smoothstep(elevation, 0.0, 0.5);
    this.sun.color.setRGB(1, 0.72 + 0.26 * warm, 0.5 + 0.42 * warm);
    this.sun.intensity = day > 0.02 ? 3.1 * day : 0.35;
    if (day <= 0.02) this.sun.color.setRGB(0.62, 0.72, 1.0);
    this.hemi.intensity = 0.06 + 0.16 * day;
    this.hemi.color.setRGB(0.55 + 0.3 * day, 0.65 + 0.25 * day, 1);
    this.stars.material.opacity = THREE.MathUtils.clamp(this.night * 1.2 - 0.2, 0, 1);
    this.stars.position.copy(focus);
    const fogDay = new THREE.Color(0xc3dbee), fogDusk = new THREE.Color(0xf0b78a), fogNight = new THREE.Color(0x0b1424);
    const fc = fogDay.clone().lerp(fogDusk, 1 - warm).lerp(fogNight, this.night);
    this.fog.color.copy(fc);
    this.renderer.toneMappingExposure = (0.9 + 0.9 * this.night) * (this.exposure ?? 1);
    // lights that only make sense after dark
    lightsPower.lamps.value = this.lampsOverride ?? (this.night > 0.5 ? 1 : 0);
    if (this.ready && Math.abs(this.hours - this.lastEnvHours) > 0.5) this.updateEnvironment();
  }

  updateEnvironment() {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = (0.12 + 0.3 * (1 - this.night)) * (this.envBoost ?? 1);
    this.lastEnvHours = this.hours;
  }
}

function makeStars() {
  const n = 2200, pos = new Float32Array(n * 3);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u);
    const rr = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * rr * 2500, y * 2500 + 50, Math.sin(a) * rr * 2500], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}
