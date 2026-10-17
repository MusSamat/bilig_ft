/**
 * Procedural textures for declarative parts (`Part.texture`): planets, the
 * Sun, Saturn's rings, wood grain, measuring grids and glow sprites.
 *
 * Everything is computed from a seeded hash, so a scene looks the same on
 * every machine and in every thumbnail; nothing is downloaded. Pixels are
 * written straight into DataTextures (no canvas needed), at most 1024 px,
 * built lazily on first use and cached for the session (a handful of small
 * textures, shared by every scene that uses them).
 */
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, type Texture, UnsignedByteType,
} from 'three';

export const PART_TEXTURES = [
  'sun', 'earth', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
  'rings', 'wood', 'grid', 'halo', 'rim',
] as const;
export type PartTexture = (typeof PART_TEXTURES)[number];

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/** Lattice values from a fixed permutation (fast integer lookups, same on every machine). */
const PERM = new Uint8Array(512);
const VALS = new Float32Array(256);
{
  let a = 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VALS[i] = next();
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = (fx + seed * 31) & 255, Y = (fy + seed * 57) & 255, Z = (fz + seed * 13) & 255;
  let u = x - fx, v = y - fy, w = z - fz;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const c000 = VALS[PERM[AA]], c100 = VALS[PERM[BA]], c010 = VALS[PERM[AB]], c110 = VALS[PERM[BB]];
  const c001 = VALS[PERM[AA + 1]], c101 = VALS[PERM[BA + 1]], c011 = VALS[PERM[AB + 1]], c111 = VALS[PERM[BB + 1]];
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Fractal noise in [0, 1]. */
export function fbm(x: number, y: number, z: number, octaves = 5, seed = 0): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise3(x * f, y * f, z * f, seed + o * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** Seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Colour ramp: stops [position 0–1, colour], compiled once. */
type Ramp = (t: number) => RGB;
function rampOf(stops: [number, string][]): Ramp {
  const s = stops.map(([p, c]) => [p, hex(c)] as const);
  return (t) => {
    if (t <= s[0][0]) return [...s[0][1]];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) return mix(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
    }
    return [...s[s.length - 1][1]];
  };
}
const ramp = (r: Ramp, t: number) => r(t);

/** Colour ramps. */
const R0 = rampOf([[0, '#2f5d2a'], [0.5, '#4f7b35'], [1, '#6f8a45']]);
const R1 = rampOf([[0, '#b8925a'], [1, '#d9c08a']]);
const R2 = rampOf([[0, '#0b2a5c'], [1, '#164a8a']]);
const R3 = rampOf([[0, '#e8590c'], [0.3, '#fd7e14'], [0.55, '#ffa94d'], [0.78, '#ffd43b'], [1, '#fff9db']]);
const R4 = rampOf([[0, '#b08560'], [0.5, '#d2ae84'], [1, '#e8cfab']]);
const R5 = rampOf([[0, '#8a3b1e'], [0.5, '#c1592c'], [1, '#e08a54']]);

function makeTexture(w: number, h: number, data: Uint8Array, opts: { color?: boolean; repeat?: boolean; mipmaps?: boolean } = {}): DataTexture {
  const t = new DataTexture(data as Uint8Array<ArrayBuffer>, w, h, RGBAFormat, UnsignedByteType);
  t.colorSpace = opts.color === false ? NoColorSpace : SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = opts.repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  const pow2 = (n: number) => (n & (n - 1)) === 0;
  t.generateMipmaps = opts.mipmaps !== false && pow2(w) && pow2(h);
  t.minFilter = t.generateMipmaps ? LinearMipmapLinearFilter : LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Equirectangular sphere map (three's SphereGeometry UVs): `fn` gets the unit
 * direction and latitude/longitude (radians) and writes RGBA.
 */
type PixelFn = (x: number, y: number, z: number, lat: number, lon: number, f: Float32Array, i: number, j: number) => [number, number, number, number?];

function sphereMap(w: number, h: number, fn: PixelFn, coarse?: { k: number; fn: (x: number, y: number, z: number, out: Float32Array) => void }): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  const sample = coarse ? coarseFields(Math.min(256, w), Math.min(128, h), coarse.k, coarse.fn) : null;
  const f = new Float32Array(coarse?.k ?? 0);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const lat = -Math.PI / 2 + Math.PI * v;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const lon = 2 * Math.PI * u - Math.PI;
      const x = -Math.cos(2 * Math.PI * u) * cl, z = Math.sin(2 * Math.PI * u) * cl;
      sample?.(u, v, f);
      const [r, g, b, a = 255] = fn(x, sl, z, lat, lon, f, i, j);
      const k = (j * w + i) * 4;
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a;
    }
  }
  return d;
}

/**
 * Smooth fields computed on a coarse sphere grid and sampled bilinearly at
 * full resolution: low-frequency noise doesn't need a full-resolution fbm.
 */
function coarseFields(fw: number, fh: number, k: number, fn: (x: number, y: number, z: number, out: Float32Array) => void) {
  const data = new Float32Array(fw * fh * k);
  const out = new Float32Array(k);
  for (let j = 0; j < fh; j++) {
    const lat = -Math.PI / 2 + (Math.PI * (j + 0.5)) / fh;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < fw; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / fw;
      fn(-Math.cos(a) * cl, sl, Math.sin(a) * cl, out);
      data.set(out, (j * fw + i) * k);
    }
  }
  /** Bilinear sample at texture coordinates u, v (0–1) into `res`. */
  return (u: number, v: number, res: Float32Array) => {
    const x = u * fw - 0.5, y = Math.max(0, Math.min(fh - 1.001, v * fh - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const i0 = ((x0 % fw) + fw) % fw, i1 = (i0 + 1) % fw;
    const a = (y0 * fw + i0) * k, b = (y0 * fw + i1) * k, c = ((y0 + 1) * fw + i0) * k, d = ((y0 + 1) * fw + i1) * k;
    for (let q = 0; q < k; q++) {
      const top = data[a + q] + (data[b + q] - data[a + q]) * tx;
      const bot = data[c + q] + (data[d + q] - data[c + q]) * tx;
      res[q] = top + (bot - top) * ty;
    }
  };
}

// ---------------------------------------------------------------------------
// Earth: hand-traced continent outlines (lon, lat in degrees), coastlines
// roughened with noise so they read as land, not polygons.
// ---------------------------------------------------------------------------

const CONTINENTS: number[][] = [
  // North America
  [-168, 66, -162, 70, -140, 70, -125, 71, -95, 72, -80, 73, -62, 60, -55, 52, -66, 45, -70, 42, -76, 35, -81, 31, -80, 25, -82, 28, -90, 30, -97, 27, -97, 21, -88, 21, -87, 16, -83, 10, -79, 8, -85, 11, -92, 15, -105, 20, -110, 24, -115, 30, -118, 34, -124, 40, -124, 48, -130, 55, -140, 60, -152, 58, -165, 60],
  // Greenland
  [-55, 60, -45, 60, -20, 70, -20, 82, -60, 82, -72, 78, -58, 70],
  // South America
  [-80, 9, -75, 11, -62, 11, -50, 0, -35, -5, -35, -10, -40, -22, -48, -28, -58, -38, -65, -42, -68, -55, -73, -50, -72, -35, -71, -18, -76, -14, -81, -5, -80, 0, -78, 7],
  // Eurasia
  [-10, 36, -9, 43, -2, 44, -5, 48, 2, 51, 8, 54, 5, 60, 15, 69, 28, 71, 40, 67, 60, 70, 70, 73, 80, 73, 100, 78, 115, 73, 140, 72, 160, 70, 180, 68, 180, 65, 170, 60, 160, 55, 156, 51, 142, 47, 135, 43, 129, 35, 122, 40, 121, 31, 118, 24, 110, 20, 108, 12, 104, 9, 100, 14, 98, 8, 103, 1, 98, 16, 92, 22, 88, 22, 80, 15, 77, 8, 73, 20, 67, 25, 57, 25, 56, 27, 50, 30, 48, 29, 36, 36, 28, 37, 26, 40, 23, 36, 20, 40, 15, 38, 13, 45, 12, 44, 18, 40, 10, 44, 3, 43, -1, 37, -6, 36],
  // Arabia
  [35, 28, 39, 22, 43, 13, 52, 16, 59, 22, 56, 26, 50, 30, 48, 30, 36, 33],
  // Africa
  [-17, 21, -6, 36, 10, 37, 11, 33, 20, 31, 32, 31, 35, 28, 43, 12, 51, 12, 40, -2, 40, -15, 35, -24, 32, -29, 20, -35, 18, -32, 12, -18, 13, -6, 9, 4, 5, 6, -8, 4, -15, 11, -17, 15],
  // Madagascar
  [44, -25, 47, -25, 50, -15, 49, -12, 44, -17],
  // Australia
  [113, -22, 114, -34, 118, -35, 130, -32, 137, -35, 141, -38, 147, -39, 150, -37, 153, -28, 153, -25, 145, -15, 142, -11, 136, -12, 130, -12, 125, -15, 122, -18],
  // British Isles
  [-5, 50, 1, 51, -2, 58, -6, 58],
  // Japan
  [130, 31, 141, 36, 142, 45, 140, 41, 135, 34],
  // Borneo, Sumatra, New Guinea
  [109, 1, 117, 7, 119, 1, 116, -4, 110, -3],
  [95, 5, 106, -6, 102, -5],
  [131, -1, 141, -3, 150, -10, 141, -9],
  // New Zealand
  [166, -46, 174, -41, 178, -38, 173, -35, 172, -41],
  // Iceland
  [-24, 64, -14, 64, -15, 66.5, -22, 66.5],
];


function earth(): Uint8Array {
  const W = 1024, H = 512;
  // Land mask on a coarse grid first (polygon tests are the slow part), then upsampled with jitter.
  const MW = 360, MH = 180;
  const mask = new Uint8Array(MW * MH);
  // Scanline fill (even–odd) of every outline.
  for (const p of CONTINENTS) {
    for (let j = 0; j < MH; j++) {
      const lat = -90 + (180 * (j + 0.5)) / MH;
      const xs: number[] = [];
      for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2) {
        const yi = p[i + 1], yk = p[k + 1];
        if (yi > lat !== yk > lat) xs.push(p[i] + ((p[k] - p[i]) * (lat - yi)) / (yk - yi));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil(((xs[q] + 180) * MW) / 360 - 0.5));
        const i1 = Math.min(MW - 1, Math.floor(((xs[q + 1] + 180) * MW) / 360 - 0.5));
        for (let i = i0; i <= i1; i++) mask[j * MW + i] = 1;
      }
    }
  }
  const land = (lonDeg: number, latDeg: number) => {
    const i = Math.floor(((((lonDeg + 180) % 360) + 360) % 360) * (MW / 360)) % MW;
    const j = Math.max(0, Math.min(MH - 1, Math.floor((latDeg + 90) * (MH / 180))));
    return mask[j * MW + i];
  };
  // Coast jitter (x, y), colour variation, mountains, clouds, Antarctic edge.
  const fields = coarseFields(256, 128, 6, (x, y, z, o) => {
    o[0] = (fbm(x * 3, y * 3, z * 3, 4, 11) - 0.5) * 9;
    o[1] = (fbm(x * 3 + 5, y * 3, z * 3, 4, 12) - 0.5) * 7;
    o[2] = fbm(x * 6, y * 6, z * 6, 4, 3);
    o[3] = fbm(x * 9, y * 9, z * 9, 3, 8);
    o[4] = fbm(x * 4 + 9, y * 8, z * 4, 5, 21);
    o[5] = (fbm(x * 4, y * 4, z * 4, 3, 5) - 0.5) * 8;
  });
  const f = new Float32Array(6);
  const D = 180 / Math.PI;
  const SNOW = hex('#f2f5f8'), ROCK = hex('#7a7462'), SHELF = hex('#2a7ab0'), ICE = hex('#e8eef4'), WHITE = hex('#ffffff');
  const d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    const lat = -Math.PI / 2 + Math.PI * v;
    const latD = lat * D;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const lonD = 360 * u - 180;
      fields(u, v, f);
      const jx = f[0], jy = f[1], n0 = f[2], mtn = f[3], cl = f[4], antJ = f[5];
      // Fine grain so the land doesn't look airbrushed.
      const grain = noise3(u * 180, v * 90, 0.5, 4) - 0.5;
      const n = n0 + grain * 0.18;
      const ant = latD < -70 + antJ;
      const isLand = ant || land(lonD + jx, latD + jy) === 1;
      let c: RGB;
      if (isLand) {
        const a = Math.abs(latD);
        // Dry belts around 20–30° latitude; green tropics and mid-latitudes.
        const dry = smooth(0.35, 0.75, Math.exp(-(((a - 24) / 10) ** 2)) * 0.9 + (n - 0.5) * 0.9);
        c = mix(ramp(R0, n), ramp(R1, n), dry);
        c = mix(c, ROCK, smooth(0.6, 0.78, mtn + grain * 0.1) * 0.6);
        const snow = ant || a > 72 + (n - 0.5) * 10 || (lonD < -15 && lonD > -75 && latD > 60); // Greenland
        if (snow) c = mix(c, SNOW, 0.92);
      } else {
        const deep = ramp(R2, n);
        // Shallow shelf near the coast.
        const near = land(lonD + jx * 1.4 + 1.5, latD + jy * 1.4) || land(lonD + jx * 1.4 - 1.5, latD + jy * 1.4);
        c = near ? mix(deep, SHELF, 0.55) : deep;
        if (Math.abs(latD) > 76) c = mix(c, ICE, 0.85);
      }
      // Light cloud wisps (kept thin: the continents must stay readable).
      const band = 0.55 + 0.25 * Math.cos(lat * 6);
      c = mix(c, WHITE, smooth(0.58, 0.8, (cl + grain * 0.12) * band + 0.22) * 0.55);
      const k = (j * W + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  return d;
}

/** Crater relief on an equirectangular grid: each crater is stamped into its own lat/lon box. */
function craterHeights(seed: number, count: number, w: number, h: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(w * h);
  for (let n = 0; n < count; n++) {
    const cu = r() * 2 - 1, t = r() * 2 * Math.PI;
    const sx = Math.sqrt(1 - cu * cu);
    const cx = sx * Math.cos(t), cy = cu, cz = sx * Math.sin(t);
    const size = 0.025 + 0.16 * r() ** 3;
    const reach = size * 1.3;
    const clat = Math.asin(cy);
    const j0 = Math.max(0, Math.floor(((clat - reach + Math.PI / 2) / Math.PI) * h));
    const j1 = Math.min(h - 1, Math.ceil(((clat + reach + Math.PI / 2) / Math.PI) * h));
    const cosReach = Math.cos(reach);
    for (let j = j0; j <= j1; j++) {
      const lat = -Math.PI / 2 + (Math.PI * (j + 0.5)) / h;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < w; i++) {
        const a2 = (2 * Math.PI * (i + 0.5)) / w;
        const d = -Math.cos(a2) * cl * cx + sl * cy + Math.sin(a2) * cl * cz;
        if (d < cosReach) continue;
        const a = Math.acos(Math.min(1, d)) / size; // 0 at the centre, 1 at the rim
        out[j * w + i] += a < 1 ? (a * a - 1) * 0.6 + 0.35 * a ** 8 : 0.35 * Math.exp(-(((a - 1) / 0.12) ** 2));
      }
    }
  }
  return out;
}

const ROCKY = { moon: { seed: 3, craters: 90 }, mercury: { seed: 8, craters: 120 } } as const;
const craterCache = new Map<string, Float32Array>();
const cratersOf = (kind: keyof typeof ROCKY) => {
  let c = craterCache.get(kind);
  if (!c) craterCache.set(kind, (c = craterHeights(ROCKY[kind].seed, ROCKY[kind].craters, 512, 256)));
  return c;
};

function rocky(kind: keyof typeof ROCKY, stopList: [number, string][], maria: number): Uint8Array {
  const stops = rampOf(stopList);
  const { seed } = ROCKY[kind];
  const craters = cratersOf(kind);
  return sphereMap(512, 256, (x, y, z, _lat, _lon, f, i, j) => {
    const grain = noise3(x * 40, y * 40, z * 40, seed + 9) - 0.5;
    const n = f[0] + grain * 0.2;
    const m = smooth(0.52, 0.6, f[1]) * maria;
    const t = n * 0.55 + 0.35 - m * 0.4 + craters[j * 512 + i] * 0.18;
    const c = ramp(stops, t);
    return [c[0], c[1], c[2]];
  }, { k: 2, fn: (x, y, z, o) => { o[0] = fbm(x * 5, y * 5, z * 5, 4, seed); o[1] = fbm(x * 1.6, y * 1.6, z * 1.6, 3, seed + 3); } });
}

function bands(stopList: [number, string][], opts: { freq: number; turb: number; seed: number; spot?: { lat: number; lon: number; w: number; h: number; color: string } }): Uint8Array {
  const stops = rampOf(stopList);
  const spot = opts.spot ? hex(opts.spot.color) : null;
  return sphereMap(512, 256, (x, y, z, lat, lon, f) => {
    const fine = f[1] + (noise3(x * 6, y * 60, z * 6, opts.seed + 2) - 0.5) * 0.25;
    const t = 0.5 + 0.5 * Math.sin(lat * opts.freq + f[0] * 6 + fine * 0.9);
    let c = ramp(stops, t * 0.85 + fine * 0.15);
    if (opts.spot && spot) {
      const s = opts.spot;
      const d = ((lat - s.lat) / s.h) ** 2 + ((lon - s.lon) / s.w) ** 2;
      if (d < 1.4) c = mix(c, spot, smooth(1.4, 0.4, d + (f[2] - 0.5) * 0.6));
    }
    // Slightly darker poles.
    c = mix(c, mix(c, [60, 50, 40], 0.5), smooth(0.9, 1.4, Math.abs(lat)));
    return [c[0], c[1], c[2]];
  }, {
    k: 3,
    fn: (x, y, z, o) => {
      o[0] = (fbm(x * 3, y * 3, z * 3, 3, opts.seed) - 0.5) * opts.turb;
      o[1] = fbm(x * 2, y * 24, z * 2, 2, opts.seed + 5);
      o[2] = fbm(x * 8, y * 8, z * 8, 2, 9);
    },
  });
}

function sun(): Uint8Array {
  return sphereMap(512, 256, (x, y, z, _lat, _lon, f) => {
    // Granulation (fine cells) on top of large active regions.
    const g = noise3(x * 48, y * 48, z * 48, 43);
    const t = 0.58 + (f[0] - 0.5) * 0.8 + (g - 0.5) * 0.35 + (f[1] - 0.5) * 0.6;
    const c = ramp(R3, t);
    return [c[0], c[1], c[2]];
  }, { k: 2, fn: (x, y, z, o) => { o[0] = fbm(x * 20, y * 20, z * 20, 2, 41); o[1] = fbm(x * 3, y * 3, z * 3, 3, 42); } });
}

function rings(): Uint8Array {
  const W = 512, H = 4;
  const d = new Uint8Array(W * H * 4);
  const r = rng(7);
  const noise = Array.from({ length: W }, () => r());
  for (let i = 0; i < W; i++) {
    const u = i / (W - 1); // 0 = inner edge, 1 = outer edge
    let a = 0.55 + 0.35 * Math.sin(u * 70) * 0.3 + (noise[i] - 0.5) * 0.35;
    a *= smooth(0, 0.08, u) * smooth(1, 0.94, u);
    if (u > 0.58 && u < 0.65) a *= 0.08; // Cassini division
    if (u < 0.2) a *= 0.45; // faint inner C ring
    const c = mix(hex('#b49c7c'), hex('#efe2c4'), 0.5 + (noise[(i * 7) % W] - 0.5) + (u > 0.65 ? -0.15 : 0.1));
    for (let j = 0; j < H; j++) {
      const k = (j * W + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  return d;
}

function wood(): Uint8Array {
  const W = 512, H = 512;
  const d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H;
      // Grain along u: growth rings warped by low-frequency noise; tileable via a torus mapping.
      const a = 2 * Math.PI * u, b = 2 * Math.PI * v;
      const px = Math.cos(a), py = Math.sin(a), pz = Math.cos(b) * 0.6, pw = Math.sin(b) * 0.6;
      // Gentle waves only: straight, long grain lines like sawn timber.
      const warp = fbm(px * 0.8 + pz, py * 0.8, pw, 3, 5);
      const ringT = (((v * 12 + (warp - 0.5) * 0.9) % 1) + 1) % 1;
      const ringV = smooth(0.0, 0.6, ringT) * smooth(1.0, 0.75, ringT);
      // Fine fibres along the grain (period 256 of the lattice keeps it tileable).
      const fibre = noise3(px * 1.5, py * 1.5, v * 256, 9);
      const c = ramp(R4, 0.25 + ringV * 0.45 + fibre * 0.3);
      const k = (j * W + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  return d;
}

/** One cell of a measuring grid (repeats once per scene unit): light face, darker cell borders. */
function grid(): Uint8Array {
  const W = 128;
  const d = new Uint8Array(W * W * 4);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const e = Math.min(i, j, W - 1 - i, W - 1 - j);
      const line = e < 2 ? 0.58 : e < 4 ? 0.8 : 1;
      const k = (j * W + i) * 4;
      const v = Math.round(255 * line);
      d[k] = v; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
    }
  }
  return d;
}

/** Radial glow for sprites: white, alpha falls off with distance. */
function radial(fn: (r: number) => number): Uint8Array {
  const W = 128;
  const d = new Uint8Array(W * W * 4);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const r = Math.hypot(i + 0.5 - W / 2, j + 0.5 - W / 2) / (W / 2);
      const k = (j * W + i) * 4;
      d[k] = 255; d[k + 1] = 255; d[k + 2] = 255;
      d[k + 3] = Math.round(255 * Math.max(0, Math.min(1, fn(r))));
    }
  }
  return d;
}

/** Sprite radius (in units of the sphere radius) used by the `rim` texture. */
export const RIM_SPRITE_SCALE = 1.3;

const builders: Record<PartTexture, () => DataTexture> = {
  sun: () => makeTexture(512, 256, sun()),
  earth: () => makeTexture(1024, 512, earth()),
  moon: () => makeTexture(512, 256, rocky('moon', [[0, '#4a4a4c'], [0.45, '#8d8c8a'], [0.75, '#bdbbb6'], [1, '#e6e4de']], 1)),
  mercury: () => makeTexture(512, 256, rocky('mercury', [[0, '#4d443d'], [0.5, '#8e8274'], [1, '#cfc4b4']], 0.4)),
  venus: () => makeTexture(512, 256, bands([[0, '#c99a52'], [0.5, '#e6c587'], [1, '#f6e3b4']], { freq: 5, turb: 2.5, seed: 13 })),
  mars: () =>
    makeTexture(512, 256, sphereMap(512, 256, (x, y, z, lat, _lon, f) => {
      const n = f[0] + (noise3(x * 40, y * 40, z * 40, 33) - 0.5) * 0.2;
      const dark = smooth(0.5, 0.62, f[1]);
      let c = mix(ramp(R5, n), hex('#5e2a19'), dark * 0.6);
      if (Math.abs(lat) > 1.3 + (n - 0.5) * 0.2) c = mix(c, hex('#f4efe8'), 0.9);
      return [c[0], c[1], c[2]];
    }, { k: 2, fn: (x, y, z, o) => { o[0] = fbm(x * 4, y * 4, z * 4, 4, 31); o[1] = fbm(x * 1.8, y * 1.8, z * 1.8, 3, 32); } })),
  jupiter: () =>
    makeTexture(512, 256, bands([[0, '#a86e48'], [0.3, '#d29d6e'], [0.55, '#ecd7b4'], [0.8, '#f6ecdb'], [1, '#dcc0a0']], {
      freq: 11, turb: 1.4, seed: 51, spot: { lat: -0.38, lon: 0.9, w: 0.32, h: 0.11, color: '#b5462e' },
    })),
  saturn: () => makeTexture(512, 256, bands([[0, '#b8996a'], [0.5, '#e3cc9a'], [1, '#f4e6c3']], { freq: 9, turb: 0.9, seed: 61 })),
  uranus: () => makeTexture(512, 256, bands([[0, '#7cc6d6'], [0.5, '#9ad9e4'], [1, '#bdeaf0']], { freq: 6, turb: 0.4, seed: 71 })),
  neptune: () =>
    makeTexture(512, 256, bands([[0, '#22379a'], [0.5, '#3557c9'], [1, '#5b7fe0']], {
      freq: 7, turb: 1.2, seed: 81, spot: { lat: -0.35, lon: -0.6, w: 0.22, h: 0.09, color: '#1a2466' },
    })),
  rings: () => {
    const t = makeTexture(512, 4, rings(), { mipmaps: false });
    t.wrapS = ClampToEdgeWrapping;
    return t;
  },
  wood: () => makeTexture(512, 512, wood(), { repeat: true }),
  grid: () => makeTexture(128, 128, grid(), { repeat: true }),
  halo: () => makeTexture(128, 128, radial((r) => (r >= 1 ? 0 : (1 - r) ** 2.2 * 0.9 + Math.exp(-((r / 0.42) ** 2)) * 0.35)), { mipmaps: false }),
  rim: () =>
    makeTexture(128, 128, radial((r) => {
      // Sphere edge at 1/RIM_SPRITE_SCALE of the sprite radius; glow fades outwards.
      const e = 1 / RIM_SPRITE_SCALE;
      return r < e ? 0.55 * (r / e) ** 6 : Math.exp(-((((r - e) / (1 - e)) * 3.2) ** 1.6)) * 0.75 * smooth(1, 0.9, r);
    }), { mipmaps: false }),
};

const cache = new Map<PartTexture, DataTexture>();

/** Shared texture (built on first use, kept for the session). */
export function partTexture(kind: PartTexture): Texture {
  let t = cache.get(kind);
  if (!t) {
    t = builders[kind]();
    cache.set(kind, t);
  }
  return t;
}

/** Height map for rocky bodies (bump): the same craters as the colour map. */
const bumpCache = new Map<string, DataTexture>();
export function bumpTexture(kind: 'moon' | 'mercury'): Texture {
  let t = bumpCache.get(kind);
  if (!t) {
    const craters = cratersOf(kind);
    const seed = ROCKY[kind].seed;
    const data = sphereMap(512, 256, (x, y, z, _lat, _lon, _f, i, j) => {
      const v = Math.max(0, Math.min(255, Math.round(128 + craters[j * 512 + i] * 70 + (noise3(x * 30, y * 30, z * 30, seed) - 0.5) * 40)));
      return [v, v, v];
    });
    t = makeTexture(512, 256, data, { color: false });
    bumpCache.set(kind, t);
  }
  return t;
}
