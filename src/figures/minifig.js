import * as THREE from 'three/webgpu';
import { MM, C } from '../config.js';
import { plastic } from '../bricks/materials.js';

// Minifigs: a 7-joint rig (neck, shoulders, wrists, hips -> legs) moving the way the real toy moves:
// legs swing stiffly from the hip pin, arms rotate at the shoulder, hands twist at the wrist. Faces +z.

export const FIGURES = {
  hugo: {
    name: 'Hugo', role: 'Dad', skin: 0x6f4a34, hair: 'curly', hairColor: C.black,
    torso: C.white, arms: C.white, legs: C.darkBluishGrey, hips: C.darkBluishGrey, print: 'coat',
  },
  dada: {
    name: 'Dada', role: 'Son', skin: C.lightNougat, hair: 'swept', hairColor: C.tan,
    torso: C.black, arms: C.black, legs: C.black, hips: C.black, print: 'jacket',
  },
  princess: {
    name: 'Princess', role: 'Neighbour', skin: C.yellow, hair: 'long', hairColor: C.darkOrange,
    torso: C.lavender, arms: C.lavender, legs: C.lightBluishGrey, hips: C.lavender, print: 'gown', skirt: true, hat: C.mediumLavender,
  },
  blocky: {
    name: 'Blocky', role: 'King of the throne', skin: C.white, hair: 'block', hairColor: C.white,
    torso: C.white, arms: C.white, legs: C.white, hips: C.white, print: 'spots', blockHead: true,
  },
};

const mm = (v) => v * MM;

function faceTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  // the face occupies the middle of the texture (u = 0.5 is the front of the head)
  const cx = 128, cy = 64;
  g.fillStyle = '#1b1b1b';
  g.beginPath(); g.ellipse(cx - 14, cy - 6, 4.2, 6.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + 14, cy - 6, 4.2, 6.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx - 13, cy - 8, 1.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 15, cy - 8, 1.4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.lineCap = 'round';
  // brows
  g.beginPath(); g.moveTo(cx - 20, cy - 18); g.quadraticCurveTo(cx - 14, cy - 22, cx - 8, cy - 18); g.stroke();
  g.beginPath(); g.moveTo(cx + 8, cy - 18); g.quadraticCurveTo(cx + 14, cy - 22, cx + 20, cy - 18); g.stroke();
  // smile
  g.lineWidth = 3.2;
  g.beginPath(); g.arc(cx, cy + 4, 15, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
  if (kind === 'princess') {
    g.fillStyle = '#c0283c';
    g.beginPath(); g.ellipse(cx, cy + 17, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.6;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx + s * (14 + k * 3), cy - 11); g.lineTo(cx + s * (17 + k * 4), cy - 15); g.stroke(); }
  }
  if (kind === 'dada') {
    g.fillStyle = 'rgba(170,90,60,0.45)';
    for (const [x, y] of [[-20, 6], [-16, 9], [-23, 9], [20, 6], [16, 9], [23, 9]]) { g.beginPath(); g.arc(cx + x, cy + y, 1.3, 0, Math.PI * 2); g.fill(); }
  }
  if (kind === 'hugo') {
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx - 12, cy + 26); g.quadraticCurveTo(cx, cy + 30, cx + 12, cy + 26); g.stroke(); // chin line (beard shadow)
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function torsoTexture(print, base) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(base).getHexString();
  g.fillRect(0, 0, 256, 256);
  if (print === 'coat') {
    // white coat, open over a dark shirt, with lapels and a pocket
    g.fillStyle = '#2a3a4a';
    g.beginPath(); g.moveTo(98, 0); g.lineTo(158, 0); g.lineTo(128, 120); g.closePath(); g.fill();
    g.fillStyle = '#c9ccd0';
    g.beginPath(); g.moveTo(92, 0); g.lineTo(104, 0); g.lineTo(128, 128); g.lineTo(118, 140); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(164, 0); g.lineTo(152, 0); g.lineTo(128, 128); g.lineTo(138, 140); g.closePath(); g.fill();
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 256); g.stroke();
    g.strokeRect(160, 150, 46, 30);
    g.fillStyle = '#3c6fd6'; g.fillRect(170, 140, 5, 22); g.fillStyle = '#c91a09'; g.fillRect(180, 142, 5, 20);
  } else if (print === 'jacket') {
    g.fillStyle = '#9ad21a';
    g.fillRect(0, 150, 256, 18);
    g.fillRect(118, 0, 20, 256);
    g.fillStyle = '#5f8a10';
    g.beginPath(); g.moveTo(70, 40); g.lineTo(110, 40); g.lineTo(90, 90); g.closePath(); g.fill();
    g.fillStyle = '#e8e8e8'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('D', 185, 100);
  } else if (print === 'gown') {
    g.fillStyle = '#ac78ba';
    g.beginPath(); g.moveTo(60, 256); g.lineTo(196, 256); g.lineTo(150, 110); g.lineTo(106, 110); g.closePath(); g.fill();
    g.fillStyle = '#d8b34a';
    g.fillRect(70, 100, 116, 12);
    g.strokeStyle = '#d8b34a'; g.lineWidth = 3;
    for (let y = 130; y < 240; y += 22) { g.beginPath(); g.moveTo(112, y); g.lineTo(144, y + 14); g.moveTo(144, y); g.lineTo(112, y + 14); g.stroke(); }
    g.fillStyle = '#f2d0dc';
    g.beginPath(); g.ellipse(128, 0, 64, 40, 0, 0, Math.PI); g.fill();
  } else if (print === 'spots') {
    g.fillStyle = '#7a5230';
    for (const [x, y, s] of [[60, 60, 30], [170, 50, 24], [110, 140, 36], [200, 170, 26], [50, 200, 28], [150, 220, 22]]) g.fillRect(x - s / 2, y - s / 2, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function torsoGeometry() {
  const g = new THREE.BoxGeometry(mm(15.6), mm(12.8), mm(7.6), 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0) { p.setX(i, p.getX(i) * (12.2 / 15.6)); p.setZ(i, p.getZ(i) * 0.92); }
  }
  g.computeVertexNormals();
  return g;
}

function armGeometry() {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(mm(0.9), mm(-5.5), mm(0.2)), new THREE.Vector3(mm(1.4), mm(-9.0), mm(2.6))];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 10, mm(2.5), 10, false);
  const p = tube.attributes.position, tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / 11), t = ring / 10;
    const c = curve.getPointAt(Math.min(1, t));
    tmp.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - 0.22 * t).add(c);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  tube.computeVertexNormals();
  return { geo: tube, end: curve.getPointAt(1) };
}

function hairGeometry(kind) {
  if (kind === 'curly') {
    const g = new THREE.SphereGeometry(mm(5.6), 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 2600) * Math.sin(v.y * 2400) * Math.sin(v.z * 2800);
      v.multiplyScalar(1 + 0.06 * n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  if (kind === 'swept') {
    const g = new THREE.SphereGeometry(mm(5.5), 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      // sweep forward and up over the brow; a few tufts
      const front = Math.max(0, v.z / mm(5.5));
      const tuft = Math.pow(Math.max(0, Math.sin(Math.atan2(v.x, v.z) * 5)), 6) * 0.12;
      v.y += mm(1.2) * front * front;
      v.multiplyScalar(1 + tuft);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  if (kind === 'long') {
    const cap = new THREE.SphereGeometry(mm(5.5), 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
    return cap;
  }
  return null;
}

export function buildMinifig(key) {
  const spec = FIGURES[key];
  const root = new THREE.Group();
  root.name = 'fig-' + key;
  const skinMat = plastic(spec.skin);
  const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // hips + legs
  const hips = new THREE.Group();
  hips.position.y = mm(12.4);
  root.add(hips);
  const hipBox = shadow(new THREE.Mesh(new THREE.BoxGeometry(mm(15.6), mm(3.2), mm(7.4)), plastic(spec.hips)));
  hipBox.position.y = mm(1.0);
  hips.add(hipBox);
  const legs = [];
  if (spec.skirt) {
    const skirt = shadow(new THREE.Mesh(new THREE.CylinderGeometry(mm(7.4), mm(10.4), mm(12.4), 4, 1), plastic(spec.legs)));
    skirt.rotation.y = Math.PI / 4;
    skirt.scale.set(1, 1, 0.8);
    skirt.position.y = -mm(6.0);
    hips.add(skirt);
  } else {
    const legGeo = new THREE.BoxGeometry(mm(7.4), mm(10.6), mm(6.6));
    legGeo.translate(0, -mm(5.6), 0);
    const footGeo = new THREE.BoxGeometry(mm(7.4), mm(2.2), mm(8.8));
    footGeo.translate(0, -mm(11.3), mm(1.0));
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * mm(3.9), 0, 0);
      leg.add(shadow(new THREE.Mesh(legGeo, plastic(spec.legs))));
      leg.add(shadow(new THREE.Mesh(footGeo, plastic(spec.legs))));
      hips.add(leg);
      legs.push(leg);
    }
  }

  // torso with print on the front face
  const torso = new THREE.Group();
  torso.position.y = mm(15.0);
  root.add(torso);
  const tBase = plastic(spec.torso);
  const tPrint = new THREE.MeshPhysicalNodeMaterial({ map: torsoTexture(spec.print, spec.torso), roughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.15, ior: 1.55 });
  const torsoMesh = shadow(new THREE.Mesh(torsoGeometry(), [tBase, tBase, tBase, tBase, tPrint, tBase]));
  torsoMesh.position.y = mm(6.4);
  torso.add(torsoMesh);
  const neck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(mm(3.0), mm(3.0), mm(1.6), 16), skinMat));
  neck.position.y = mm(13.4);
  torso.add(neck);

  // arms + hands
  const arms = [], hands = [];
  const { geo: armGeo, end } = armGeometry();
  const handGeo = new THREE.TorusGeometry(mm(1.9), mm(1.0), 8, 14, Math.PI * 1.55);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * mm(6.4), mm(11.0), 0);
    const mesh = shadow(new THREE.Mesh(armGeo, plastic(spec.arms)));
    if (s < 0) mesh.scale.x = -1;
    arm.add(mesh);
    const shoulder = shadow(new THREE.Mesh(new THREE.SphereGeometry(mm(2.7), 14, 10), plastic(spec.arms)));
    shoulder.position.y = -mm(0.6);
    arm.add(shoulder);
    const wrist = new THREE.Group();
    wrist.position.set(s * end.x, end.y, end.z);
    const hand = shadow(new THREE.Mesh(handGeo, skinMat));
    hand.rotation.set(Math.PI / 2, 0, Math.PI * 0.72);
    hand.position.set(0, -mm(1.2), mm(1.2));
    wrist.add(hand);
    arm.add(wrist);
    torso.add(arm);
    arm.rotation.z = s * 0.06;
    arms.push(arm);
    hands.push(wrist);
  }

  // head
  const head = new THREE.Group();
  head.position.y = mm(14.2);
  torso.add(head);
  if (spec.blockHead) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1b1b1b'; g.fillRect(12, 22, 10, 10); g.fillRect(42, 22, 10, 10);
    g.fillStyle = '#e0a060'; g.fillRect(24, 38, 16, 8);
    g.fillStyle = '#c0392b'; g.fillRect(28, 46, 8, 6);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const faceMat = new THREE.MeshPhysicalNodeMaterial({ map: tex, roughness: 0.3, clearcoat: 0.2 });
    const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(mm(11), mm(11), mm(11)), [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat]));
    box.position.y = mm(5.8);
    head.add(box);
  } else {
    const headGeo = new THREE.CylinderGeometry(mm(4.8), mm(4.8), mm(8.6), 32, 1, false, -Math.PI, Math.PI * 2);
    const faceMat = new THREE.MeshPhysicalNodeMaterial({ color: spec.skin, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.15, ior: 1.55 });
    const faceTex = faceTexture(key);
    // face decal: second material over the side surface with the printed face (alpha)
    const decal = new THREE.MeshPhysicalNodeMaterial({ map: faceTex, transparent: true, roughness: 0.3, clearcoat: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const headMesh = shadow(new THREE.Mesh(headGeo, [faceMat, faceMat, faceMat]));
    headMesh.position.y = mm(4.6);
    head.add(headMesh);
    const decalMesh = new THREE.Mesh(new THREE.CylinderGeometry(mm(4.83), mm(4.83), mm(8.0), 32, 1, true, -Math.PI, Math.PI * 2), decal);
    decalMesh.position.y = mm(4.6);
    head.add(decalMesh);
    // rounded top + bottom edges
    for (const y of [mm(0.3), mm(8.9)]) {
      const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(mm(4.45), mm(0.36), 6, 32), faceMat));
      rim.rotation.x = Math.PI / 2; rim.position.y = y; head.add(rim);
    }
    const capTop = shadow(new THREE.Mesh(new THREE.CylinderGeometry(mm(4.45), mm(4.45), mm(0.4), 32), faceMat));
    capTop.position.y = mm(9.1); head.add(capTop);
    const hairGeo = hairGeometry(spec.hair);
    if (hairGeo) {
      const hairMat = plastic(spec.hairColor);
      const hair = shadow(new THREE.Mesh(hairGeo, hairMat));
      hair.position.y = mm(6.6);
      hair.scale.set(1.0, spec.hair === 'curly' ? 1.05 : 0.95, 1.02);
      head.add(hair);
      if (spec.hair === 'long') {
        const back = shadow(new THREE.Mesh(new THREE.CylinderGeometry(mm(5.4), mm(6.4), mm(13), 20, 1, true, Math.PI * 0.55, Math.PI * 0.9), hairMat));
        back.position.set(0, mm(1.0), 0);
        back.rotation.y = Math.PI;
        head.add(back);
        // hennin (tall cone hat) with a veil band
        const hat = shadow(new THREE.Mesh(new THREE.ConeGeometry(mm(4.8), mm(15), 24), plastic(spec.hat)));
        hat.position.y = mm(18.5);
        head.add(hat);
        const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(mm(4.9), mm(0.8), 8, 24), plastic(C.pearlGold)));
        band.rotation.x = Math.PI / 2; band.position.y = mm(11.3);
        head.add(band);
      }
    }
  }

  const fig = {
    key, spec, root,
    parts: { hips, legs, torso, arms, hands, head },
    state: 'idle',
    phase: 0,
    t: Math.random() * 10,
    // target joint angles, blended each frame
    animate(dt, speed = 0) {
      this.t += dt;
      const P = this.parts;
      let legA = 0, armA = 0, armSide = 0.06, headYaw = 0, sit = 0, drive = 0;
      if (this.state === 'walk' || this.state === 'run') {
        const rate = this.state === 'run' ? 2.2 : 1.6;
        this.phase += dt * Math.max(2, speed) * rate;
        const amp = this.state === 'run' ? 0.85 : 0.55;
        legA = Math.sin(this.phase) * amp;
        armA = Math.sin(this.phase) * amp * 0.9;
      } else if (this.state === 'sit' || this.state === 'drive' || this.state === 'ride') {
        sit = 1;
        if (this.state === 'drive') drive = 1;
      } else if (this.state === 'jump') {
        legA = 0.35; armA = 0;
        armSide = 0.5;
      } else {
        headYaw = Math.sin(this.t * 0.6) * 0.25 * Math.max(0, Math.sin(this.t * 0.17));
      }
      const k = 1 - Math.exp(-dt * 14);
      const lerp = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
      if (P.legs.length) {
        lerp(P.legs[0].rotation, 'x', sit ? -Math.PI / 2 : -legA);
        lerp(P.legs[1].rotation, 'x', sit ? -Math.PI / 2 : legA);
        if (this.state === 'ride') { lerp(P.legs[0].rotation, 'z', -0.5); lerp(P.legs[1].rotation, 'z', 0.5); }
        else { lerp(P.legs[0].rotation, 'z', 0); lerp(P.legs[1].rotation, 'z', 0); }
      }
      lerp(P.arms[0].rotation, 'x', drive ? -1.1 : sit ? -0.35 : armA);
      lerp(P.arms[1].rotation, 'x', drive ? -1.1 : sit ? -0.35 : -armA);
      lerp(P.arms[0].rotation, 'z', -armSide);
      lerp(P.arms[1].rotation, 'z', armSide);
      lerp(P.head.rotation, 'y', headYaw);
    },
  };
  return fig;
}

// Hip height when seated: the root sits this far below the seat surface's top so the hips rest on it.
export const SIT_HIP = mm(12.4);
export const FIG_HEIGHT = mm(40);
