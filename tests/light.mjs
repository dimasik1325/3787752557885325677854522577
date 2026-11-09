import { World } from '../src/world.js';
import { ID, getBlock } from '../src/blocks.js';
const world = new World(1337);
for (let dz=-2; dz<=2; dz++) for (let dx=-2; dx<=2; dx++) world.generateChunk(dx,dz);
const x=8, z=8;
const surf = world.heightAt(x,z);
console.log('surface y', surf, getBlock(world.getBlock(x,surf,z)).name);
// ставим светокамень на глубине 20 (в пещере или в камне)
world.setBlock(x, 30, z, ID.glowstone);
console.log('--- уровень света вокруг светокамня (y=30) ---');
for (let dz=-4; dz<=4; dz++) {
  let row='';
  for (let dx=-4; dx<=4; dx++) {
    const l = world.getLight(x+dx, 30, z+dz);
    const b = world.getBlock(x+dx,30,z+dz);
    row += b===0 ? String(l).padStart(2) : ' #';
  }
  console.log(row);
}
console.log('glowstone block light at source:', world.getChunk(x>>4,z>>4).blockLight[ (x&15) + (z&15)*16 + 30*256 ]);
console.log('sky light at y=30:', world.getChunk(x>>4,z>>4).skyLight[(x&15)+(z&15)*16+30*256]);
// небесный свет на поверхности
console.log('sky at surface+5:', world.getLight(x, surf+5, z), ' inside ground:', world.getLight(x, surf-3, z));
