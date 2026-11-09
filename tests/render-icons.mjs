import fs from 'node:fs';
import { Canvas, installCanvasShim, encodePNG } from './canvas-shim.mjs';
installCanvasShim();
const { buildTextureAtlas } = await import('../src/textures.js');
const { drawBlockIcon } = await import('../src/ui.js');
const { blockByName } = await import('../src/blocks.js');
const atlas = buildTextureAtlas();
const names = ['grass','dirt','stone','sand','log','leaves','planks','glass','bricks','tnt','glowstone','cobblestone','diamond_ore','snow_block','cactus','flower_red','water','sandstone','ice','wool_red','coal_ore','gold_ore','iron_ore','gravel'];
const size = 76, cols = 8, rows = Math.ceil(names.length/cols);
const out = new Canvas(cols*size, rows*size);
for (let i=0;i<out.data.length;i+=4){out.data[i]=198;out.data[i+1]=198;out.data[i+2]=198;out.data[i+3]=255;}
const ctx = out.getContext('2d');
names.forEach((name,i)=>{
  const icon = new Canvas(64,64);
  drawBlockIcon(icon, blockByName(name), atlas);
  const col=i%cols, row=Math.floor(i/cols);
  ctx.drawImage(icon,0,0,64,64,col*size+6,row*size+6,64,64);
});
fs.writeFileSync('tests/out/icons.png', encodePNG(out.width,out.height,out.data));
console.log('ok');
