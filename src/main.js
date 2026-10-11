import * as THREE from 'three/webgpu';
import { params } from './config.js';
import { Physics } from './game/physics.js';
import { Input } from './game/input.js';
import { Hud } from './game/hud.js';
import { Sky } from './world/sky.js';
import { Post } from './render/post.js';
import { Game } from './game/game.js';
import { PLATEAU } from './world/island.js';

const err = document.getElementById('err');
const showErr = (e) => { err.style.display = 'block'; err.textContent = String(e && e.stack ? e.stack : e).slice(0, 1200); console.error(e); };
addEventListener('error', (e) => showErr(e.error || e.message));
addEventListener('unhandledrejection', (e) => showErr(e.reason));

const SHOTS = {
  hero: { pos: [1.5, 9.5, -15.5], look: [0, 0.8, 1.2] },
  low: { pos: [16.5, 2.6, 2.5], look: [0, 1.4, 0.5] },
  top: { pos: [0, 26, 0.01], look: [0, 0, 0] },
  dining: { pos: [-4.0, 3.3, -0.4], look: [-6.9, 0.8, 3.6] },
  chicken: { pos: [-0.5, 3.4, -10.5], look: [-5.4, 2.0, -3.6] },
  kart: { pos: [-2.4, 1.8, 12.6], look: [-6.8, 0.5, 7.6] },
  island: { pos: [70, 110, 250], look: [0, 0, 10], abs: true },
  volcano: { pos: [35, 26, -10], look: [85, 18, -66], abs: true },
  beach: { pos: [42, 9, 52], look: [64, 1, 80], abs: true },
  night: { pos: [1.5, 9.5, -15.5], look: [0, 0.8, 1.2], hours: 20.8 },
};

async function boot() {
  const status = document.getElementById('status');
  const canvas = document.getElementById('c');
  const shot = params.get('shot');
  if (shot && shot !== 'title') document.body.classList.add('shot');

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: params.has('webgl'), powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  await renderer.init();
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  status.textContent = `Building the island (${backend})…`;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.08, 9000);
  const physics = await new Physics().init();
  const input = new Input(canvas);
  const hud = new Hud();
  const sky = new Sky(scene, renderer);
  sky.setHours(params.has('time') ? +params.get('time') : 16.2);
  if (params.has('env')) sky.envBoost = +params.get('env');
  if (params.has('exp')) sky.exposure = +params.get('exp');
  const post = new Post(renderer, scene, camera);
  post.setTier(params.get('quality') || 'high');

  const game = new Game({ scene, camera, physics, input, hud, sky, post });
  await new Promise((r) => setTimeout(r, 0));
  game.build();
  sky.ready = true;
  sky.update(new THREE.Vector3(0, PLATEAU, 0));
  sky.updateEnvironment();
  window.game = game;
  status.textContent = `Ready · ${backend}`;

  const play = document.getElementById('play');
  const start = () => { if (game.playing) return; hud.showTitle(false); game.start(); canvas.focus(); canvas.requestPointerLock?.(); };
  play.addEventListener('click', start);
  addEventListener('keydown', (e) => { if (!game.playing && !shot && (e.code === 'Enter' || e.code === 'Space')) start(); });
  if (params.has('play')) { hud.showTitle(false); game.start(); }
  if (params.has('asbuilt')) game.toggleAsBuilt();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // adaptive governor: step down a tier when frames stay slow (never up automatically)
  let slow = 0;
  const clock = new THREE.Timer();
  let frames = 0;
  window.__frames = 0;

  const preset = shot && SHOTS[shot];
  if (preset?.hours) sky.setHours(preset.hours);

  renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(clock.getDelta(), 1 / 20);
    game.update(dt);
    if (preset) {
      const off = preset.abs ? new THREE.Vector3() : new THREE.Vector3(0, PLATEAU, 0);
      camera.position.fromArray(preset.pos).add(off);
      camera.lookAt(new THREE.Vector3().fromArray(preset.look).add(off));
      sky.update(camera.position.clone().setY(PLATEAU));
    }
    post.render();
    input.endFrame();
    frames++; window.__frames = frames;
    if (params.has('headless') && frames >= 2) renderer.setAnimationLoop(null);
    if (params.has('stopAt') && frames >= +params.get('stopAt')) renderer.setAnimationLoop(null);
    if (!shot && game.playing) {
      slow = dt > 0.028 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 2.5 && post.tier !== 'low') {
        const next = post.tier === 'high' ? 'medium' : 'low';
        post.setTier(next);
        if (next === 'low') renderer.setPixelRatio(1);
        hud.toast(`Quality lowered to ${next} for a smoother frame rate (Q to change)`);
        slow = 0;
      }
    }
  });
}

boot().catch(showErr);
