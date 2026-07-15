/**
 * Simplex-ish value noise for procedural voxel terrain
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hash2(x, z, seed) {
  let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function noise2D(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);
  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

export function fbm(x, z, seed, octaves = 4) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2D(x * f, z * f, seed + i * 19);
    a *= 0.5;
    f *= 2;
  }
  return v;
}
