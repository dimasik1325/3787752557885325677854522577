import { WorldGenerator, BIOME } from '../src/worldgen.js';
import { World } from '../src/world.js';
import { AIR, ID, getBlock } from '../src/blocks.js';

const gen = new WorldGenerator(1337);
console.log('--- columnInfo samples ---');
for (const [x,z] of [[0,0],[100,50],[-200,300],[1000,1000],[5000,-3000],[-20,-40]]) {
  const i = gen.columnInfo(x,z);
  console.log(`(${x},${z}) h=${i.height} biome=${i.biome} temp=${i.temp.toFixed(2)} humid=${i.humid.toFixed(2)}`);
}

const world = new World(1337);
const t0 = Date.now();
for (let dz=-3; dz<=3; dz++) for (let dx=-3; dx<=3; dx++) world.generateChunk(dx,dz);
console.log('gen 49 chunks ms:', Date.now()-t0);

let counts = new Map();
for (const c of world.chunks.values()) for (const b of c.blocks) counts.set(b,(counts.get(b)||0)+1);
console.log('block histogram:');
[...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([id,n])=>{
  const def = getBlock(id);
  if (id===0) console.log(`  AIR ${n}`);
  else console.log(`  ${def.name}: ${n}`);
});
