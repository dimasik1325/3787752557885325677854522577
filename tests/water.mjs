import { World } from '../src/world.js';
import { ID, getBlock } from '../src/blocks.js';
const world = new World(1337);
// ищем океан рядом
const gen = world.generator;
let oceanAt = null;
for (let r=0; r<400 && !oceanAt; r+=8) for (let a=0; a<360; a+=15) {
  const x = Math.round(Math.cos(a*Math.PI/180)*r), z = Math.round(Math.sin(a*Math.PI/180)*r);
  const i = gen.columnInfo(x,z);
  if (i.height < 58) { oceanAt = {x,z,h:i.height}; break; }
}
console.log('ocean found at', oceanAt);
if (oceanAt) {
  const cx = Math.floor(oceanAt.x/16), cz = Math.floor(oceanAt.z/16);
  for (let dz=-1;dz<=1;dz++) for (let dx=-1;dx<=1;dx++) world.generateChunk(cx+dx,cz+dz);
  let water=0, ice=0, sand=0;
  for (const c of world.chunks.values()) for (const b of c.blocks) { if (b===ID.water) water++; if (b===ID.ice) ice++; if (b===ID.sand) sand++; }
  console.log('water blocks', water, 'sand', sand);
  const h = world.heightAt(oceanAt.x, oceanAt.z);
  console.log('column at ocean:', h, getBlock(world.getBlock(oceanAt.x,h,oceanAt.z)).name, 'above:', getBlock(world.getBlock(oceanAt.x,h+1,oceanAt.z)).name);
}
// проверка: много ли «парящих» кусков земли
let floating=0, checked=0;
for (let x=-100;x<100;x+=3) for (let z=-100;z<100;z+=3) {
  if (!world.isGenerated(x,z)) continue;
  checked++;
  const h = world.heightAt(x,z);
  for (let y=h; y>1; y--) {
    if (world.getBlock(x,y,z)===0) {
      // дырка под землёй — пещера, это норм; смотрим только на «висящие сверху» 
      break;
    }
  }
}
console.log('checked columns', checked, 'floating', floating);
