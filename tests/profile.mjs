import { World } from '../src/world.js';
import { buildChunkGeometry } from '../src/mesher.js';
const fakeAtlas = { uv: () => [0.01, 0.5, 0.11, 0.6], names: ['stone'], cols: 8, tile: 16 };
const world = new World(42);
for (let dz=-2; dz<=2; dz++) for (let dx=-2; dx<=2; dx++) world.generateChunk(dx,dz);
const chunks=[...world.chunks.values()];
// warmup JIT
for (let i=0;i<3;i++) for (const c of chunks) buildChunkGeometry(world,c,fakeAtlas);
for (let round=0; round<3; round++) {
  const t0=performance.now();
  let faces=0;
  for (const c of chunks) faces += buildChunkGeometry(world,c,fakeAtlas).faceCount;
  const dt=performance.now()-t0;
  console.log(`round ${round}: ${dt.toFixed(1)}ms total, ${(dt/chunks.length).toFixed(2)}ms/chunk, faces=${faces}`);
}
