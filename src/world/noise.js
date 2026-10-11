// Small seeded 2D value-noise with fbm; deterministic so the island is the same for everyone.
export function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rnd() * 2 - 1);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = perm[(xi & 255) + perm[yi & 255]], b = perm[((xi + 1) & 255) + perm[yi & 255]];
    const c = perm[(xi & 255) + perm[(yi + 1) & 255]], d = perm[((xi + 1) & 255) + perm[(yi + 1) & 255]];
    const u = fade(xf), v = fade(yf);
    const x1 = val[a] + (val[b] - val[a]) * u, x2 = val[c] + (val[d] - val[c]) * u;
    return x1 + (x2 - x1) * v;
  }
  function fbm(x, y, oct = 4) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * noise(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  return { noise, fbm, rnd };
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
