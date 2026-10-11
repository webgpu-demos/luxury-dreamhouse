// Stills for QA: node tools/shot.mjs [baseUrl] [shot1,shot2,...] [extra query]
// Uses the preinstalled Chromium; WebGPU when the browser offers it, otherwise the WebGL 2 fallback.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:5290/';
const shots = (process.argv[3] || 'hero').split(',');
const extra = process.argv[4] || '';
const frames = +(process.env.FRAMES || 30);
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
fs.mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  const url = `${base}?shot=${s}&stopAt=${frames}${extra ? '&' + extra : ''}`;
  const t0 = Date.now();
  await page.goto(url);
  try {
    await page.waitForFunction((n) => (window.__frames || 0) >= n, frames, { timeout: 240000 });
  } catch (e) { logs.push('[timeout] ' + e.message); }
  const info = await page.evaluate(() => ({ frames: window.__frames, err: document.getElementById('err').textContent, status: document.getElementById('status').textContent }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${s}.png`, timeout: 120000 });
  console.log(`${s}: ${((Date.now() - t0) / 1000).toFixed(1)}s frames=${info.frames} status="${info.status}"${info.err ? ' ERR=' + info.err.slice(0, 400) : ''}`);
  for (const l of [...new Set(logs)].slice(0, 15)) console.log('   ', l.slice(0, 300));
  await page.close();
}
await browser.close();
