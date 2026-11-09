import { World } from '../src/world.js';
const w = new World(7);
for (let dz=-1; dz<=1; dz++) for (let dx=-1; dx<=1; dx++) w.generateChunk(dx,dz);
const c = w.getChunk(0,0);
// warm
for (let i=0;i<3;i++) c.computeLight(w.neighborLights(0,0));
let t0=performance.now();
for (let i=0;i<20;i++) c.computeLight(w.neighborLights(0,0));
console.log('light/chunk', ((performance.now()-t0)/20).toFixed(2), 'ms');
t0=performance.now();
for (let i=0;i<10;i++) w.setBlock(8, 40+i, 8, 33);
console.log('setBlock(light x5 chunks)', ((performance.now()-t0)/10).toFixed(2), 'ms');
