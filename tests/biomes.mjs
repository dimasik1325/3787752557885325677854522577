import { WorldGenerator } from '../src/worldgen.js';
const gen = new WorldGenerator(1337);
const counts = new Map(); let tmin=9,tmax=-9; let water=0, total=0;
for (let x=-3000; x<=3000; x+=60) for (let z=-3000; z<=3000; z+=60) {
  const i = gen.columnInfo(x,z);
  counts.set(i.biome,(counts.get(i.biome)||0)+1);
  tmin=Math.min(tmin,i.temp); tmax=Math.max(tmax,i.temp);
  total++; if (i.height<62) water++;
}
console.log('biomes:', [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${(v/total*100).toFixed(1)}%`).join('  '));
console.log('temp range', tmin.toFixed(2), tmax.toFixed(2), 'water%', (water/total*100).toFixed(1));
