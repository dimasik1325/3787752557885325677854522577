import * as THREE from 'three';
import { World } from '../src/world.js';
import { buildChunkGeometry } from '../src/mesher.js';
import { Player, findSpawn } from '../src/player.js';
import { getBlock } from '../src/blocks.js';

const fakeAtlas = { uv: () => [0.01, 0.5, 0.11, 0.6], names: ['stone'], cols: 8, tile: 16 };

const world = new World(42);
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) world.generateChunk(dx, dz);

// 1. Мешер
const t0 = performance.now();
let faces = 0, tris = 0;
for (const c of world.chunks.values()) {
  const d = buildChunkGeometry(world, c, fakeAtlas);
  faces += d.faceCount;
  for (const k of ['solid','cutout','water','emissive']) if (d[k]) tris += d[k].index.count / 3;
}
console.log(`mesher: ${faces} faces, ${tris} tris, ${(performance.now()-t0).toFixed(1)} ms for ${world.chunks.size} chunks`);

// 2. Рейкаст
const origin = new THREE.Vector3(8.5, 90, 8.5);
const hit = world.raycast(origin, new THREE.Vector3(0, -1, 0), 60);
console.log('raycast down:', hit && { x: hit.x, y: hit.y, z: hit.z, block: getBlock(hit.id).name, normal: hit.normal, dist: hit.distance.toFixed(2) });

// 3. Рейкаст вбок в воздухе — не должен находить
const side = world.raycast(new THREE.Vector3(8.5, 120, 8.5), new THREE.Vector3(1, 0, 0), 10);
console.log('raycast sideways high:', side);

// 4. Спавн и физика
const spawn = findSpawn(world, 8, 8);
console.log('spawn:', spawn.toArray().map(v=>+v.toFixed(1)));
const player = new Player(world);
player.setPosition(spawn.x, spawn.y + 5, spawn.z);
const cam = new THREE.PerspectiveCamera(70, 1.7, 0.1, 500);
const input = { forward:false, back:false, left:false, right:false, jump:false, sneak:false, sprint:false };
let ticks = 0;
for (let i = 0; i < 240; i++) {
  player.update(1/60, input, cam);
  if (player.onGround) { ticks = i; break; }
}
console.log(`fall landed after ${ticks} ticks at y=${player.position.y.toFixed(2)} ground=${player.onGround} health=${player.health}`);

// 5. Ходьба вперёд
const startXZ = [player.position.x, player.position.z];
player.yaw = 0;
const inp2 = { ...input, forward: true };
for (let i = 0; i < 120; i++) player.update(1/60, inp2, cam);
const moved = Math.hypot(player.position.x-startXZ[0], player.position.z-startXZ[1]);
console.log(`walked 2s: ${moved.toFixed(2)} blocks, y=${player.position.y.toFixed(2)} onGround=${player.onGround} inWater=${player.inWater}`);

// 6. Прыжок
player.velocity.y = 0; player.onGround = true;
let maxY = player.position.y;
for (let i = 0; i < 60; i++) { player.update(1/60, { ...input, jump: i < 3 }, cam); maxY = Math.max(maxY, player.position.y); }
console.log(`jump height: ${(maxY - player.position.y).toFixed(2)}`);

// 7. Проверка падения урона
const hp = player.health;
player.setPosition(spawn.x, spawn.y + 20, spawn.z);
for (let i = 0; i < 400; i++) { player.update(1/60, input, cam); if (player.onGround) break; }
console.log(`fall damage test: before ${hp} after ${player.health}, cause=${player.lastCause}`);

// 8. Модификации блоков
const bx = Math.floor(spawn.x), bz = Math.floor(spawn.z);
const hy = world.heightAt(bx, bz);
console.log('surface block', getBlock(world.getBlock(bx, hy, bz)).name);
world.setBlock(bx, hy, bz, 0);
console.log('after break', world.getBlock(bx, hy, bz), 'mods', world.modifications.size);
world.setBlock(bx, hy, bz, getBlock(3).id);
console.log('after place', getBlock(world.getBlock(bx,hy,bz)).name);
