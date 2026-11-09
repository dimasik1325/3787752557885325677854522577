import { WorldGenerator } from '../src/worldgen.js';
import { renderScene } from './raster.mjs';
const gen = new WorldGenerator(1337);
let spot = null;
for (let r = 10; r < 300 && !spot; r += 3) {
  for (let a = 0; a < 360; a += 10) {
    const x = Math.round(Math.cos(a*Math.PI/180)*r), z = Math.round(Math.sin(a*Math.PI/180)*r);
    const i = gen.columnInfo(x,z);
    if (i.height > 60 && i.height < 64) {
      // проверяем, что рядом (в 8 блоках) есть вода
      for (const [dx,dz] of [[8,0],[-8,0],[0,8],[0,-8]]) {
        if (gen.columnInfo(x+dx,z+dz).height < 60) { spot = {x,z,dx,dz}; break; }
      }
    }
    if (spot) break;
  }
}
console.log('river bank', spot);
if (spot) {
  const yaw = Math.atan2(-spot.dx, -spot.dz);
  renderScene({ seed: 1337, px: spot.x + spot.dx*0.5, pz: spot.z + spot.dz*0.5, yaw, pitch: -0.18, radius: 3, out: 'tests/out/scene_river.png', hour: 11, heightOffset: 1.2 });
}
