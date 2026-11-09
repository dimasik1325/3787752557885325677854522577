import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './config.js';
import { AIR, ID, getBlock } from './blocks.js';
import { WorldGenerator } from './worldgen.js';

export const chunkKey = (cx, cz) => cx + ',' + cz;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    // итоговое освещение (для мешей/рендера) и его составляющие
    this.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.skyLight = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.blockLight = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.generated = false;
    this.dirty = true;
    this.lightDirty = true;
    this.maxY = WORLD_HEIGHT - 1;
    this.mesh = null;
    this.waterMesh = null;
    this.emissiveMesh = null;
    this.entities = [];
  }

  get(lx, ly, lz) {
    if (ly < 0 || ly >= WORLD_HEIGHT) return AIR;
    return this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE];
  }

  set(lx, ly, lz, id) {
    if (ly < 0 || ly >= WORLD_HEIGHT) return;
    this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] = id;
  }

  /**
   * Считает свет внутри чанка: небесный сверху вниз + распространение
   * от светящихся блоков (BFS). На границах чанка свет «затекает» с соседей.
   */
  computeLight(neighbors = {}) {
    const blocks = this.blocks;
    const sky = this.skyLight;
    const blk = this.blockLight;
    const light = this.light;
    const S = CHUNK_SIZE;
    const H = WORLD_HEIGHT;
    const idx = (x, y, z) => x + z * S + y * S * S;

    sky.fill(0);
    blk.fill(0);

    const queue = [];
    const push = (x, y, z, level) => {
      queue.push(x, y, z, level);
    };

    // 1. Небесный свет сверху вниз
    for (let lz = 0; lz < S; lz++) {
      for (let lx = 0; lx < S; lx++) {
        let level = 15;
        for (let y = H - 1; y >= 0; y--) {
          const i = idx(lx, y, lz);
          const b = blocks[i];
          if (b !== AIR) {
            const def = getBlock(b);
            if (def.opaque) level = Math.max(0, level - 4);
            else if (def.liquid) level = Math.max(0, level - 2);
            else level = Math.max(0, level - 1);
          }
          sky[i] = level;
          if (level <= 0) break;
        }
      }
    }

    // 2. Свет от блоков-источников внутри чанка
    for (let y = 0; y < H; y++) {
      for (let lz = 0; lz < S; lz++) {
        for (let lx = 0; lx < S; lx++) {
          const b = blocks[idx(lx, y, lz)];
          if (b === AIR) continue;
          const def = getBlock(b);
          if (def.light > 0) {
            blk[idx(lx, y, lz)] = def.light;
            push(lx, y, lz, def.light);
          }
        }
      }
    }

    // 3. Свет, заходящий с соседних чанков
    const edgeIn = (chunkSrc, nx, ny, nz, lx, ly, lz) => {
      if (!chunkSrc) return;
      const si = nx + nz * S + ny * S * S;
      const skyLevel = chunkSrc.skyLight[si];
      const blockLevel = chunkSrc.blockLight[si];
      const dst = idx(lx, ly, lz);
      if (skyLevel > sky[dst] + 1) {
        sky[dst] = skyLevel;
        push(lx, ly, lz, skyLevel);
      }
      if (blockLevel - 1 > blk[dst]) {
        blk[dst] = blockLevel - 1;
        push(lx, ly, lz, blockLevel - 1);
      }
    };

    if (neighbors.px) {
      for (let y = 0; y < H; y++) for (let lz = 0; lz < S; lz++) edgeIn(neighbors.px, 0, y, lz, S - 1, y, lz);
    }
    if (neighbors.nx) {
      for (let y = 0; y < H; y++) for (let lz = 0; lz < S; lz++) edgeIn(neighbors.nx, S - 1, y, lz, 0, y, lz);
    }
    if (neighbors.pz) {
      for (let y = 0; y < H; y++) for (let lx = 0; lx < S; lx++) edgeIn(neighbors.pz, lx, y, 0, lx, y, S - 1);
    }
    if (neighbors.nz) {
      for (let y = 0; y < H; y++) for (let lx = 0; lx < S; lx++) edgeIn(neighbors.nz, lx, y, S - 1, lx, y, 0);
    }

    // 4. BFS-распространение (свет и от неба по пещерам, и от факелов)
    const dirs = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++];
      const y = queue[head++];
      const z = queue[head++];
      const level = queue[head++];
      const src = idx(x, y, z);
      const isBlockSrc = blk[src] >= level && level > sky[src];
      const curSky = sky[src];
      const curBlock = blk[src];

      for (let d = 0; d < 18; d += 3) {
        const nx = x + dirs[d];
        const ny = y + dirs[d + 1];
        const nz = z + dirs[d + 2];
        if (nx < 0 || nx >= S || nz < 0 || nz >= S || ny < 0 || ny >= H) continue;
        const ni = idx(nx, ny, nz);
        const b = blocks[ni];
        let cost = 1;
        if (b !== AIR) {
          const def = getBlock(b);
          if (def.opaque) continue;
          if (def.liquid) cost = 2;
        }
        // небесный свет
        const skyNext = curSky - cost;
        if (skyNext > sky[ni]) {
          sky[ni] = skyNext;
          push(nx, ny, nz, skyNext);
        }
        // свет блока
        const blockNext = curBlock - cost;
        if (blockNext > blk[ni]) {
          blk[ni] = blockNext;
          push(nx, ny, nz, blockNext);
        }
        void isBlockSrc;
      }
    }

    // 5. Итог: максимум из небесного и блочного
    for (let i = 0; i < light.length; i++) {
      const v = sky[i] > blk[i] ? sky[i] : blk[i];
      light[i] = v;
    }
    this.lightDirty = false;
  }

  /** Быстрое обновление света после установки/удаления блока */
  recalcLight(neighbors) {
    this.computeLight(neighbors);
  }
}

export class World {
  constructor(seed = 1337) {
    this.seed = seed | 0;
    this.generator = new WorldGenerator(this.seed);
    this.chunks = new Map();
    this.modifications = new Map(); // "x,y,z" -> id, для сохранения
    this.blockChangeListeners = [];
  }

  onBlockChange(fn) {
    this.blockChangeListeners.push(fn);
  }

  emitBlockChange(x, y, z, id, prev) {
    for (const fn of this.blockChangeListeners) fn(x, y, z, id, prev);
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getOrCreateChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  generateChunk(cx, cz) {
    const chunk = this.getOrCreateChunk(cx, cz);
    if (chunk.generated) return chunk;
    this.generator.generate(chunk);
    this.applyModifications(chunk);
    chunk.generated = true;
    chunk.computeLight(this.neighborLights(cx, cz));
    chunk.dirty = true;
    return chunk;
  }

  applyModifications(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (const [key, id] of this.modifications) {
      const parts = key.split(',');
      const x = +parts[0];
      const y = +parts[1];
      const z = +parts[2];
      const lx = x - ox;
      const lz = z - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
      chunk.set(lx, y, lz, id);
    }
  }

  isGenerated(x, z) {
    const chunk = this.getChunk(x >> 4, z >> 4);
    return !!chunk && chunk.generated;
  }

  getBlock(x, y, z) {
    if (y < 0) return ID.bedrock;
    if (y >= WORLD_HEIGHT) return AIR;
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!chunk || !chunk.generated) return AIR;
    return chunk.blocks[(x & 15) + (z & 15) * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  getLight(x, y, z) {
    if (y >= WORLD_HEIGHT) return 15;
    if (y < 0) return 0;
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!chunk || !chunk.generated) return 15;
    return chunk.light[(x & 15) + (z & 15) * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  /** Твёрдый ли блок для столкновений */
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (y >= WORLD_HEIGHT) return false;
    const def = getBlock(this.getBlock(x, y, z));
    return def.solid && !def.liquid;
  }

  isLiquid(x, y, z) {
    const def = getBlock(this.getBlock(x, y, z));
    return !!def.liquid;
  }

  /** Установка блока игроком (с записью в модификации и перестройкой мешей) */
  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.generated) return false;
    const lx = x & 15;
    const lz = z & 15;
    const idx = lx + lz * 16 + y * 256;
    const prev = chunk.blocks[idx];
    if (prev === id) return false;

    chunk.blocks[idx] = id;
    chunk.maxY = Math.max(chunk.maxY, y);
    if (record) this.modifications.set(`${x},${y},${z}`, id);

    // затронутые чанки (границы)
    chunk.dirty = true;
    chunk.lightDirty = true;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === 15) this.markDirty(cx, cz + 1);

    this.refreshLight(cx, cz, true);
    this.emitBlockChange(x, y, z, id, prev);
    return true;
  }

  /** Ссылки на свет соседних чанков (для «затекания» света на границах) */
  neighborLights(cx, cz) {
    const px = this.getChunk(cx + 1, cz);
    const nx = this.getChunk(cx - 1, cz);
    const pz = this.getChunk(cx, cz + 1);
    const nz = this.getChunk(cx, cz - 1);
    return {
      px: px && px.generated ? px : null,
      nx: nx && nx.generated ? nx : null,
      pz: pz && pz.generated ? pz : null,
      nz: nz && nz.generated ? nz : null,
    };
  }

  /** Пересчитывает свет в чанке и (при необходимости) у соседей */
  refreshLight(cx, cz, includeNeighbors = true) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return;
    chunk.computeLight(this.neighborLights(cx, cz));
    chunk.dirty = true;
    if (!includeNeighbors) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // пересчитываем только «крайние» соседи, но это дёшево и надёжно
      const n = this.getChunk(cx + dx, cz + dz);
      if (n && n.generated) {
        n.computeLight(this.neighborLights(cx + dx, cz + dz));
        n.dirty = true;
      }
    }
  }

  markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c) {
      c.dirty = true;
      c.lightDirty = true;
    }
  }

  /** Высота поверхности (первый воздух сверху) в данной колонке */
  heightAt(x, z) {
    if (!this.isGenerated(x, z)) {
      return this.generator.columnInfo(x, z).height;
    }
    const chunk = this.getChunk(x >> 4, z >> 4);
    const lx = x & 15;
    const lz = z & 15;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = chunk.blocks[lx + lz * 16 + y * 256];
      if (id !== AIR && !getBlock(id).liquid) return y;
    }
    return SEA_LEVEL;
  }

  /**
   * Трассировка луча по вокселям (алгоритм Amanatides & Woo).
   * Возвращает { x, y, z, normal, id, distance } или null.
   */
  raycast(origin, direction, maxDistance = 6) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(direction.x) || 1;
    const stepY = Math.sign(direction.y) || 1;
    const stepZ = Math.sign(direction.z) || 1;

    const tDeltaX = Math.abs(1 / (direction.x || 1e-9));
    const tDeltaY = Math.abs(1 / (direction.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (direction.z || 1e-9));

    const fracX = origin.x - x;
    const fracY = origin.y - y;
    const fracZ = origin.z - z;

    let tMaxX = ((stepX > 0 ? 1 - fracX : fracX) || 1e-9) * tDeltaX;
    let tMaxY = ((stepY > 0 ? 1 - fracY : fracY) || 1e-9) * tDeltaY;
    let tMaxZ = ((stepZ > 0 ? 1 - fracZ : fracZ) || 1e-9) * tDeltaZ;

    let normal = [0, 0, 0];
    let t = 0;

    for (let i = 0; i < 256; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== AIR) {
        const def = getBlock(id);
        if (def.liquid || !def.solid) {
          if (!def.liquid) {
            return { x, y, z, normal, id, distance: t };
          }
        } else {
          return { x, y, z, normal, id, distance: t };
        }
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        normal = [0, -stepY, 0];
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        normal = [0, 0, -stepZ];
      }
      if (t > maxDistance) break;
    }
    return null;
  }

  serializeModifications() {
    const out = [];
    for (const [key, id] of this.modifications) out.push([key, id]);
    return out;
  }

  loadModifications(list) {
    this.modifications.clear();
    for (const [key, id] of list) this.modifications.set(key, id);
  }

  /** Удаляет чанки дальше указанного расстояния */
  unloadFar(centerCx, centerCz, maxDist, onDispose) {
    const toRemove = [];
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - centerCx;
      const dz = chunk.cz - centerCz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) > maxDist) toRemove.push(key);
    }
    for (const key of toRemove) {
      const chunk = this.chunks.get(key);
      if (onDispose) onDispose(chunk);
      this.chunks.delete(key);
    }
    return toRemove.length;
  }
}

export { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL };
