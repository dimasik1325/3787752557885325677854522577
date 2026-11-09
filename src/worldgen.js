import { Noise } from './noise.js';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './config.js';
import { ID, AIR } from './blocks.js';
import { mulberry32, clamp, smoothstep } from './utils.js';

export const BIOME = {
  PLAINS: 'Равнины',
  FOREST: 'Лес',
  DESERT: 'Пустыня',
  SNOWY: 'Снежная тайга',
  MOUNTAINS: 'Горы',
  BEACH: 'Пляж',
  OCEAN: 'Океан',
};

/**
 * Процедурная генерация ландшафта.
 * Детерминирована по сиду, работает по «колонкам» — это позволяет
 * быстро узнавать высоту и биом в любой точке (нужно для деревьев и спавна).
 */
export class WorldGenerator {
  constructor(seed = 1337) {
    this.seed = seed | 0;
    this.heightNoise = new Noise(this.seed);
    this.hillNoise = new Noise(this.seed + 101);
    this.mountainNoise = new Noise(this.seed + 202);
    this.tempNoise = new Noise(this.seed + 303);
    this.humidNoise = new Noise(this.seed + 404);
    this.caveNoiseA = new Noise(this.seed + 505);
    this.caveNoiseB = new Noise(this.seed + 606);
    this.detailNoise = new Noise(this.seed + 707);
    this.oreNoise = new Noise(this.seed + 808);
    this.riverNoise = new Noise(this.seed + 909);
    this.riverWidthNoise = new Noise(this.seed + 1010);
    this.heightCache = new Map();
  }

  /** Высота поверхности в мировых координатах (последний твёрдый блок) */
  columnInfo(x, z) {
    const key = x + ',' + z;
    const cached = this.heightCache.get(key);
    if (cached) return cached;

    const continent = this.heightNoise.fbm2(x * 0.0016, z * 0.0016, 4);
    const hills = this.hillNoise.fbm2(x * 0.011, z * 0.011, 4);
    const mountainBand = smoothstep(-0.15, 0.35, this.mountainNoise.fbm2(x * 0.0009, z * 0.0009, 2));
    const ridge = this.mountainNoise.ridged2(x * 0.0045, z * 0.0045, 4);
    const detail = this.detailNoise.fbm2(x * 0.05, z * 0.05, 2);

    let h = SEA_LEVEL - 3 + continent * 30 + hills * 5 + detail * 1.2;
    h += Math.pow(ridge, 2.2) * 56 * mountainBand;

    // Реки: узкая «нулевая» линия шума, прорезающая рельеф до уровня моря
    const riverBase = this.riverNoise.fbm2(x * 0.0022 + 77, z * 0.0022 - 33, 3);
    const riverWidth = 0.016 + (this.riverWidthNoise.fbm2(x * 0.004, z * 0.004, 2) + 1) * 0.012;
    const riverDist = Math.abs(riverBase);
    let riverCarve = 0;
    if (riverDist < riverWidth * 3.2) {
      const t = 1 - riverDist / (riverWidth * 3.2);
      riverCarve = t * t;
    }
    if (riverCarve > 0 && h > SEA_LEVEL - 6) {
      const target = SEA_LEVEL - 3.2;
      h = h * (1 - riverCarve * 0.92) + target * (riverCarve * 0.92);
    }

    const height = clamp(Math.round(h), 4, WORLD_HEIGHT - 12);

    // расширяем «климатические» зоны, иначе всё скучковано около нуля
    const tempRaw = this.tempNoise.fbm2(x * 0.0021 + 500, z * 0.0021, 3) * 1.75;
    const humidRaw = this.humidNoise.fbm2(x * 0.0026 - 300, z * 0.0026, 3) * 1.6;
    const temp = clamp(tempRaw, -1, 1);
    const humid = clamp(humidRaw, -1, 1);

    let biome;
    if (height < SEA_LEVEL - 1) biome = BIOME.OCEAN;
    else if (height <= SEA_LEVEL + 1) biome = BIOME.BEACH;
    else if (height > 90) biome = height > 102 || temp < -0.12 ? BIOME.SNOWY : BIOME.MOUNTAINS;
    else if (temp > 0.24 && humid < 0.1) biome = BIOME.DESERT;
    else if (temp < -0.3) biome = BIOME.SNOWY;
    else if (humid > 0.02) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;

    const info = { height, biome, temp, humid };
    this.heightCache.set(key, info);
    if (this.heightCache.size > 200000) this.heightCache.clear();
    return info;
  }

  /** Пещеры: две «червеобразные» 3D-функции + большие каверны */
  isCave(x, y, z) {
    if (y < 3) return false;
    const nx = x * 0.042;
    const ny = y * 0.075;
    const nz = z * 0.042;
    const a = this.caveNoiseA.perlin3(nx, ny, nz);
    const b = this.caveNoiseB.perlin3(nx + 31.7, ny + 11.3, nz - 17.1);
    const tunnels = a * a + b * b;
    if (tunnels < 0.0055) return true;

    // Большие залы глубже
    if (y < 42) {
      const cav = this.caveNoiseA.fbm3(x * 0.013, y * 0.026, z * 0.013, 2);
      if (cav > 0.52) return true;
    }
    return false;
  }

  /** Генерирует чанк в переданный Uint8Array */
  generate(chunk) {
    const { cx, cz } = chunk;
    const blocks = chunk.blocks;
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    let maxY = 0;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx;
        const z = oz + lz;
        const info = this.columnInfo(x, z);
        const h = info.height;
        const biome = info.biome;

        let top = ID.grass;
        let filler = ID.dirt;
        if (biome === BIOME.DESERT) {
          top = ID.sand;
          filler = ID.sand;
        } else if (biome === BIOME.OCEAN) {
          top = ID.sand;
          filler = ID.sand;
        } else if (biome === BIOME.BEACH) {
          top = ID.sand;
          filler = ID.sand;
        } else if (biome === BIOME.SNOWY) {
          top = ID.snow_block;
          filler = ID.dirt;
        } else if (biome === BIOME.MOUNTAINS) {
          top = h > 92 ? ID.stone : ID.grass;
          filler = h > 92 ? ID.stone : ID.dirt;
        }

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = ID.bedrock;
          else if (y <= 2 && this.oreNoise.perlin3(x * 0.4, y * 0.4, z * 0.4) > 0.25) id = ID.bedrock;
          else if (y === h) id = top;
          else if (y > h - 4) id = filler;
          else id = ID.stone;
          blocks[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id;
        }

        // Вода и лёд в низинах
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            blocks[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = ID.water;
          }
        }

        // Пещеры
        for (let y = 3; y <= h; y++) {
          const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          if (blocks[idx] === ID.bedrock || blocks[idx] === AIR) continue;
          if (y <= SEA_LEVEL && y > h - 2) continue; // не прорезаем дно океана
          if (this.isCave(x, y, z)) {
            blocks[idx] = AIR;
          }
        }

        maxY = Math.max(maxY, h, SEA_LEVEL);
      }
    }

    this.generateOres(chunk, maxY);
    this.generateStructures(chunk);
    chunk.maxY = Math.min(WORLD_HEIGHT - 1, maxY + 12);
    chunk.dirty = true;
    return chunk;
  }

  generateOres(chunk, maxY) {
    const rand = mulberry32(this.chunkSeed(chunk.cx, chunk.cz, 77));
    const blocks = chunk.blocks;
    const place = (x, y, z, id, size) => {
      const r = size;
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy + dz * dz > r * r + 0.4) continue;
            const lx = x + dx;
            const ly = y + dy;
            const lz = z + dz;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
            if (ly < 1 || ly >= WORLD_HEIGHT) continue;
            const idx = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
            if (blocks[idx] === ID.stone) blocks[idx] = id;
          }
        }
      }
    };

    const veins = [
      { id: ID.coal_ore, count: 14, minY: 5, maxY: 100, size: 2 },
      { id: ID.iron_ore, count: 9, minY: 4, maxY: 64, size: 2 },
      { id: ID.gold_ore, count: 4, minY: 4, maxY: 32, size: 1 },
      { id: ID.diamond_ore, count: 2, minY: 4, maxY: 16, size: 1 },
      { id: ID.gravel, count: 5, minY: 5, maxY: 60, size: 2 },
    ];

    for (const v of veins) {
      for (let i = 0; i < v.count; i++) {
        const x = Math.floor(rand() * CHUNK_SIZE);
        const z = Math.floor(rand() * CHUNK_SIZE);
        const y = v.minY + Math.floor(rand() * Math.max(1, Math.min(v.maxY, maxY) - v.minY));
        place(x, y, z, v.id, v.size);
      }
    }
  }

  chunkSeed(cx, cz, salt = 0) {
    let h = Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cz | 0, 0x165667b1) ^ Math.imul(this.seed + salt, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return h >>> 0;
  }

  /** Деревья, кактусы, цветы — с учётом перекрытия границ чанков */
  generateStructures(chunk) {
    const { cx, cz } = chunk;
    // Соседние «регионы», чьи кроны могут залезть в этот чанк
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.structuresFromRegion(chunk, cx + dx, cz + dz);
      }
    }
  }

  structuresFromRegion(chunk, rx, rz) {
    const rand = mulberry32(this.chunkSeed(rx, rz, 999));
    const attempts = 8;
    for (let i = 0; i < attempts; i++) {
      const x = rx * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE);
      const z = rz * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE);
      const roll = rand();
      const info = this.columnInfo(x, z);
      if (info.height < SEA_LEVEL) continue;
      const biome = info.biome;

      if (biome === BIOME.FOREST) {
        if (roll < 0.62) this.placeTree(chunk, x, info.height + 1, z, rand, 'oak');
        else if (roll < 0.72) this.placePlant(chunk, x, info.height + 1, z, ID.flower_red);
        else if (roll < 0.82) this.placePlant(chunk, x, info.height + 1, z, ID.flower_yellow);
        else this.placePlant(chunk, x, info.height + 1, z, ID.tall_grass);
      } else if (biome === BIOME.PLAINS) {
        if (roll < 0.1) this.placeTree(chunk, x, info.height + 1, z, rand, 'oak');
        else if (roll < 0.3) this.placePlant(chunk, x, info.height + 1, z, ID.flower_yellow);
        else if (roll < 0.5) this.placePlant(chunk, x, info.height + 1, z, ID.tall_grass);
      } else if (biome === BIOME.SNOWY) {
        if (roll < 0.3) this.placeTree(chunk, x, info.height + 1, z, rand, 'spruce');
      } else if (biome === BIOME.DESERT) {
        if (roll < 0.14) this.placeCactus(chunk, x, info.height + 1, z, rand);
      } else if (biome === BIOME.MOUNTAINS) {
        if (roll < 0.06 && info.height < 95) this.placeTree(chunk, x, info.height + 1, z, rand, 'spruce');
      }
    }
  }

  localIndex(lx, ly, lz) {
    return lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
  }

  setIfInside(chunk, x, y, z, id, overwrite = false) {
    const lx = x - chunk.cx * CHUNK_SIZE;
    const lz = z - chunk.cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return false;
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const idx = this.localIndex(lx, y, lz);
    const cur = chunk.blocks[idx];
    if (!overwrite && cur !== AIR && cur !== ID.leaves && cur !== ID.water) return false;
    if (!overwrite && (cur === ID.leaves || cur === ID.water) && id === ID.leaves) return false;
    chunk.blocks[idx] = id;
    return true;
  }

  placeTree(chunk, x, y, z, rand, kind) {
    const height = kind === 'spruce' ? 7 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 3);
    const trunk = kind === 'spruce' ? ID.log : ID.log;

    // ствол
    for (let i = 0; i < height; i++) {
      this.setIfInside(chunk, x, y + i, z, trunk, true);
    }

    // крона
    if (kind === 'spruce') {
      for (let layer = 0; layer < height - 2; layer++) {
        const ly = y + height - 3 - layer;
        const radius = Math.min(3, 1 + Math.floor(layer / 2));
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
            if (dx === 0 && dz === 0) continue;
            this.setIfInside(chunk, x + dx, ly, z + dz, ID.leaves);
          }
        }
      }
    } else {
      const topY = y + height - 1;
      for (let dy = -2; dy <= 1; dy++) {
        const radius = dy <= -1 ? 2 : 1;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            this.setIfInside(chunk, x + dx, topY + dy, z + dz, ID.leaves);
          }
        }
      }
      // верхушка
      this.setIfInside(chunk, x, topY + 1, z, ID.leaves);
    }
  }

  placeCactus(chunk, x, y, z, rand) {
    const h = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < h; i++) this.setIfInside(chunk, x, y + i, z, ID.cactus, true);
  }

  placePlant(chunk, x, y, z, id) {
    this.setIfInside(chunk, x, y, z, id, false);
  }
}
