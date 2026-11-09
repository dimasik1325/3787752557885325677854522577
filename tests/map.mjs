import fs from 'node:fs';
import { encodePNG, installCanvasShim } from './canvas-shim.mjs';
import { WorldGenerator, BIOME } from '../src/worldgen.js';

const seed = +(process.argv[2] || 1337);
const S = 512;      // размер карты в блоках
const SCALE = 1;    // пикселей на блок
const gen = new WorldGenerator(seed);
const W = S * SCALE;
const data = new Uint8ClampedArray(W * W * 4);
const biomes = new Map();
for (let py = 0; py < W; py++) {
  for (let px = 0; px < W; px++) {
    const x = Math.floor((px / SCALE) - S / 2);
    const z = Math.floor((py / SCALE) - S / 2);
    const i = gen.columnInfo(x, z);
    biomes.set(i.biome, (biomes.get(i.biome) || 0) + 1);
    const h = i.height;
    let r, g, b;
    if (h < 62) { // вода
      const t = Math.min(1, (62 - h) / 12);
      r = 70 - t * 30; g = 130 - t * 60; b = 210 - t * 40;
    } else if (i.biome === BIOME.DESERT) {
      r = 226; g = 210; b = 150;
    } else if (i.biome === BIOME.SNOWY) {
      const t = Math.min(1, (h - 70) / 40);
      r = 240 - t * 40; g = 248 - t * 30; b = 255;
    } else if (h > 95) { // горы
      const t = Math.min(1, (h - 95) / 25);
      r = 140 + t * 60; g = 140 + t * 60; b = 140 + t * 60;
    } else {
      const t = Math.min(1, (h - 62) / 30);
      r = 120 + t * 20; g = 170 + t * 15; b = 90 + t * 10;
    }
    // тень по высоте для рельефа
    const hx = gen.columnInfo(x + 1, z).height;
    const hz = gen.columnInfo(x, z + 1).height;
    const slope = Math.max(-6, Math.min(6, (h - hx) + (h - hz)));
    const shade = 1 + slope * 0.02;
    const o = (py * W + px) * 4;
    data[o] = Math.max(0, Math.min(255, r * shade));
    data[o + 1] = Math.max(0, Math.min(255, g * shade));
    data[o + 2] = Math.max(0, Math.min(255, b * shade));
    data[o + 3] = 255;
  }
}
fs.mkdirSync('tests/out', { recursive: true });
fs.writeFileSync(`tests/out/map_${seed}.png`, encodePNG(W, W, data));
console.log('wrote map', seed, [...biomes.entries()].map(([k,v])=>`${k}:${(v/(W*W)*100).toFixed(1)}%`).join(' '));
