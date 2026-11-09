import { mulberry32 } from './utils.js';

const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Классический шум Перлина (2D и 3D) + фрактальные суммы */
export class Noise {
  constructor(seed = 1337) {
    const rand = mulberry32(seed | 0);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = perm[i & 255];
  }

  grad2(hash, x, y) {
    const h = (hash & 7) * 2;
    return GRAD3[h] * x + GRAD3[h + 1] * y;
  }

  grad3(hash, x, y, z) {
    const h = (hash % 12) * 3;
    return GRAD3[h] * x + GRAD3[h + 1] * y + GRAD3[h + 2] * z;
  }

  /** 2D шум Перлина, диапазон примерно [-1, 1] */
  perlin2(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const p = this.perm;
    const A = p[X] + Y;
    const B = p[X + 1] + Y;
    return lerp(
      lerp(this.grad2(p[A], x, y), this.grad2(p[B], x - 1, y), u),
      lerp(this.grad2(p[A + 1], x, y - 1), this.grad2(p[B + 1], x - 1, y - 1), u),
      v
    );
  }

  /** 3D шум Перлина, диапазон примерно [-1, 1] */
  perlin3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const p = this.perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return lerp(
      lerp(
        lerp(this.grad3(p[AA], x, y, z), this.grad3(p[BA], x - 1, y, z), u),
        lerp(this.grad3(p[AB], x, y - 1, z), this.grad3(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(this.grad3(p[AA + 1], x, y, z - 1), this.grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerp(this.grad3(p[AB + 1], x, y - 1, z - 1), this.grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.perlin2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.perlin3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Хребтовый шум (для гор) */
  ridged2(x, y, octaves = 4) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.perlin2(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
