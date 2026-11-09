import fs from 'node:fs';
import { installCanvasShim } from './canvas-shim.mjs';
installCanvasShim();
const { buildTextureAtlas } = await import('../src/textures.js');
const atlas = buildTextureAtlas();
console.log('atlas size', atlas.canvas.width, 'x', atlas.canvas.height, 'tiles', atlas.names.length);
// масштабируем x4 для наглядности
const scale = 4;
const { Canvas } = await import('./canvas-shim.mjs');
const out = new Canvas(atlas.canvas.width*scale, atlas.canvas.height*scale);
const ctx = out.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.drawImage(atlas.canvas, 0, 0, atlas.canvas.width, atlas.canvas.height, 0, 0, atlas.canvas.width*scale, atlas.canvas.height*scale);
fs.mkdirSync('tests/out', { recursive: true });
fs.writeFileSync('tests/out/atlas.png', out.toBuffer());
console.log('wrote tests/out/atlas.png');
console.log('names:', atlas.names.join(', '));
