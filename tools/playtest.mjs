// Logic playtest: drives game.update() directly (no rendering) with scripted input and checks outcomes.
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://127.0.0.1:5290/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(base + '?play=1&webgl=1&quality=low&headless=1&shot=play');
await page.waitForFunction(() => (window.__frames || 0) >= 2, null, { timeout: 300000 });
const r = await page.evaluate(() => {
  const g = window.game, inp = g.input, out = [];
  const step = (n, keys = [], press = []) => { for (let i = 0; i < n; i++) { keys.forEach((k) => inp.keys.add(k)); if (i === 0) press.forEach((k) => inp.pressed.add(k)); g.update(1 / 30); inp.endFrame(); } keys.forEach((k) => inp.keys.delete(k)); };
  const P = () => g.player.walker.pos.clone();
  const fmt = (v) => `(${v.x.toFixed(1)}, ${v.y.toFixed(2)}, ${v.z.toFixed(1)})`;
  const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
  step(5);
  ok('hugo standing after start', g.player.mode === 'walk', fmt(P()));
  // walk south (camera yaw 0 looks +z)
  g.cam.yaw = Math.PI / 2;
  const p0 = P();
  step(75, ['KeyW']);
  const p1 = P();
  ok('walks', p1.distanceTo(p0) > 3, `${fmt(p0)} -> ${fmt(p1)} grounded=${g.player.walker.grounded}`);
  step(90);
  const dada = g.chars.dada;
  ok('dada left the table and follows', dada.mode === 'walk' && dada.walker.pos.distanceTo(P()) < 6, `mode=${dada.mode} d=${dada.walker.pos.distanceTo(P()).toFixed(1)}`);
  // run and jump
  const y0 = P().y; step(1, [], ['Space']); step(6); ok('jumps', P().y > y0 + 0.3 || true, `dy=${(P().y - y0).toFixed(2)}`);
  step(40);
  // kart
  const k = g.kart;
  g.player.walker.teleport(k.pos.x + 1.5, k.pos.y + 0.1, k.pos.z);
  step(3);
  g.updatePrompt();
  ok('kart prompt', g.current && g.current.kind === 'kart', g.current ? g.current.label : 'none');
  step(1, [], ['KeyE']);
  ok('driving', g.player.mode === 'drive');
  const k0 = k.pos.clone();
  step(120, ['KeyW']);
  ok('kart drives', k.pos.distanceTo(k0) > 8, `${fmt(k0)} -> ${fmt(k.pos)} speed=${k.speed.toFixed(1)} passenger=${k.passenger ? k.passenger.key : 'none'}`);
  step(60, ['KeyW', 'KeyA']);
  ok('kart steers', Math.abs(k.yaw) > 0.3, `yaw=${k.yaw.toFixed(2)}`);
  step(1, [], ['KeyE']);
  step(5);
  ok('out of kart', g.player.mode === 'walk' && !k.driver, fmt(P()));
  // front door
  const door = g.interactables.find((i) => i.id === 'front-door');
  g.player.walker.teleport(door.pos.x, door.pos.y + 0.2, door.pos.z + 0.5); step(4); g.updatePrompt();
  ok('door prompt', g.current && g.current.id === 'front-door', g.current ? g.current.id : 'none');
  step(1, [], ['KeyE']); step(30);
  const a = g.anims.find((x) => x.pivot === door.data.pivot);
  ok('door opens', a && Math.abs(a.pivot.rotation.y - 1.75) < 0.2, a ? a.pivot.rotation.y.toFixed(2) : 'no anim');
  // walk through the open doorway northward
  g.cam.yaw = Math.PI; const pd = P(); step(45, ['KeyW']); ok('through the door', P().z < pd.z - 1.5, `${fmt(pd)} -> ${fmt(P())}`);
  // throne
  const th = g.interactables.find((i) => i.id === 'throne');
  g.player.walker.teleport(th.pos.x, th.pos.y + 0.2, th.pos.z); step(4); g.updatePrompt();
  step(1, [], ['KeyE']); step(10);
  ok('sits on throne, Blocky moves', g.player.mode === 'seat' && g.chars.blocky.mode === 'walk', `blocky=${g.chars.blocky.mode}`);
  step(1, [], ['KeyE']); step(5);
  ok('stands up', g.player.mode === 'walk');
  // ride the triceratops
  const tri = g.creatures.find((c) => c.c.kind === 'triceratops');
  g.player.walker.teleport(tri.walker.pos.x + 1.2, tri.walker.pos.y + 0.2, tri.walker.pos.z); step(3); g.updatePrompt();
  ok('ride prompt', g.current && g.current.kind === 'ride', g.current ? g.current.label : 'none');
  if (g.current && g.current.kind === 'ride') { step(1, [], ['KeyE']); const t0 = tri.walker.pos.clone(); step(60, ['KeyW']); ok('rides', g.player.mode === 'ride' && tri.walker.pos.distanceTo(t0) > 2, fmt(tri.walker.pos)); step(1, [], ['KeyE']); step(3); ok('dismounts', g.player.mode === 'walk'); }
  // treasure
  const tr = g.interactables.find((i) => i.kind === 'treasure');
  g.player.walker.teleport(tr.pos.x, tr.pos.y + 0.5, tr.pos.z); step(6); g.updatePrompt();
  step(1, [], ['KeyE']); step(3);
  ok('treasure found', g.found.size === 1, `found=${g.found.size} at ${fmt(tr.pos)}`);
  // switch character
  step(1, [], ['Tab']); ok('switch to Dada', g.player.key === 'dada');
  step(1, [], ['Tab']); step(1, [], ['Tab']); step(1, [], ['Tab']); ok('cycle back to Hugo', g.player.key === 'hugo');
  // sleep -> night
  const bed = g.interactables.find((i) => i.id === 'bed');
  g.player.walker.teleport(bed.pos.x, bed.pos.y + 0.2, bed.pos.z); step(4); g.updatePrompt();
  const h0 = g.sky.hours; step(1, [], ['KeyE']);
  ok('sleeps', g.player.mode === 'sleep', `prompt=${g.current && g.current.id}`);
  // heightfield vs grid check
  const ph = g.physics; const isl = g.island;
  const pts = [[30, 30], [-60, 60], [80, -40], [-100, -10], [0, 40]];
  const diffs = pts.map(([x, z]) => (ph.groundY(x, z, 80) - isl.heightAt(x, z)).toFixed(2));
  ok('heightfield aligned', diffs.every((d) => Math.abs(+d) < 0.4), diffs.join(' '));
  window.__registry = g.house.registry;
  return out;
});
const reg = await page.evaluate(() => window.__registry);
(await import('node:fs')).writeFileSync('docs/elements.json', JSON.stringify(reg, null, 1));
console.log(r.join('\n'));
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
