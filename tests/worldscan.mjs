// Проверка генерации на разных сидах + автоматический поиск визуальных аномалий
import { World } from '../src/world.js';
import { getBlock, ID } from '../src/blocks.js';
import { WorldGenerator } from '../src/worldgen.js';

for (const seed of [1, 42, 1337, 2024, 777777]) {
  const world = new World(seed);
  const t0 = performance.now();
  for (let dz=-3; dz<=3; dz++) for (let dx=-3; dx<=3; dx++) world.generateChunk(dx,dz);
  const genMs = performance.now()-t0;
  const gen = new WorldGenerator(seed);
  let floating=0, waterTops=0, trees=0, cactus=0, plants=0, caves=0, ores=0, snow=0;
  for (const c of world.chunks.values()) {
    for (let lz=0; lz<16; lz++) for (let lx=0; lx<16; lx++) {
      const x=c.cx*16+lx, z=c.cz*16+lz;
      const h = world.heightAt(x,z);
      const top = world.getBlock(x,h,z);
      if (top === ID.leaves || top === ID.log) trees++;
      if (top === ID.cactus) cactus++;
      if (getBlock(top).cross) plants++;
      if (top === ID.water) waterTops++;
      if (top === ID.snow_block) snow++;
      // висящие в воздухе блоки без опоры (баг генерации)
      if (h>68 && world.getBlock(x,h,z)===ID.grass && world.getBlock(x-1,h,z)===0) floating++;
    }
    for (let y=1;y<120;y++) for (let i=0;i<256;i++) {
      const b=c.blocks[i+y*256];
      if (b===ID.coal_ore||b===ID.iron_ore||b===ID.gold_ore||b===ID.diamond_ore) ores++;
      if (b===0 && y<60) caves++;
    }
  }
  console.log(`seed ${seed}: gen ${genMs.toFixed(0)}ms | trees~${trees} cactus~${cactus} plants~${plants} waterTops=${waterTops} snow=${snow} ores=${ores} caveAir(<60)=${caves}`);
}
