import { renderScene } from './raster.mjs';
import { WorldGenerator } from '../src/worldgen.js';

const gen = new WorldGenerator(1337);
function findBiome(want, maxR = 600) {
  for (let r = 0; r < maxR; r += 6) {
    for (let a = 0; a < 360; a += 12) {
      const x = Math.round(Math.cos(a * Math.PI / 180) * r);
      const z = Math.round(Math.sin(a * Math.PI / 180) * r);
      const i = gen.columnInfo(x, z);
      if (i.biome === want) return { x, z, h: i.height };
    }
  }
  return null;
}
const ocean = findBiome('Океан');
const desert = findBiome('Пустыня');
const mountain = findBiome('Горы');
const snowy = findBiome('Снежная тайга');
console.log({ ocean, desert, mountain, snowy });

// океан: камера чуть выше уровня воды
renderScene({ seed: 1337, px: ocean.x, pz: ocean.z + 30, yaw: Math.PI, pitch: -0.1, radius: 3, out: 'tests/out/scene_ocean.png', hour: 15 });
renderScene({ seed: 1337, px: desert.x, pz: desert.z, yaw: 0.9, pitch: -0.05, radius: 3, out: 'tests/out/scene_desert.png', hour: 13 });
renderScene({ seed: 1337, px: mountain.x, pz: mountain.z, yaw: 0.4, pitch: 0.05, radius: 4, out: 'tests/out/scene_mountain.png', hour: 17 });
renderScene({ seed: 1337, px: 8, pz: 8, yaw: 2.4, pitch: -0.05, radius: 4, out: 'tests/out/scene_night.png', hour: 23.5 });
