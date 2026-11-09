// Программный растеризатор в стиле WebGL-пайплайна игры.
// Нужен для проверки внешнего вида сцены без браузера.
import fs from 'node:fs';
import { Canvas, encodePNG, installCanvasShim } from './canvas-shim.mjs';

installCanvasShim();
import { World } from '../src/world.js';
import { buildChunkGeometry } from '../src/mesher.js';
import { buildTextureAtlas } from '../src/textures.js';
import { getBlock } from '../src/blocks.js';

const W = 960;
const H = 560;

function mat4Identity() {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function multiply(a, b) {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      out[i * 4 + j] = s;
    }
  }
  return out;
}
function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const out = new Float64Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}
function lookAt(eye, target, up) {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const out = mat4Identity();
  out[0] = x.x; out[1] = y.x; out[2] = z.x; out[3] = 0;
  out[4] = x.y; out[5] = y.y; out[6] = z.y; out[7] = 0;
  out[8] = x.z; out[9] = y.z; out[10] = z.z; out[11] = 0;
  out[12] = -dot(x, eye); out[13] = -dot(y, eye); out[14] = -dot(z, eye); out[15] = 1;
  return out;
}
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scaleV = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

function transform(m, v) {
  const x = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
  const y = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
  const z = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14];
  const w = m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15];
  return { x, y, z, w };
}

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Главная функция: рендерит сцену вокруг игрока */
export function renderScene({ seed = 42, px = 8, pz = 8, yaw = 0.6, pitch = -0.15, radius = 4, out = 'tests/out/scene.png', hour = 12, heightOffset = 2.6 } = {}) {
  const world = new World(seed);
  const R = radius;
  const ccx = Math.floor(px / 16);
  const ccz = Math.floor(pz / 16);
  for (let dz = -R - 1; dz <= R + 1; dz++) {
    for (let dx = -R - 1; dx <= R + 1; dx++) world.generateChunk(ccx + dx, ccz + dz);
  }

  const atlas = buildTextureAtlas();
  const atl = atlas.canvas;
  const TILE = atlas.tile;
  const COLS = atlas.cols;
  const ROWS = atlas.rows;

  const colorBuf = new Float32Array(W * H * 3);
  const depthBuf = new Float32Array(W * H).fill(Infinity);

  // Небо: градиент + солнце
  const dayFactor = Math.max(0, Math.min(1, (Math.sin(((hour / 24) - 0.25) * Math.PI * 2) + 0.12) / 0.45));
  const top = lerpColor([5, 10, 24], [63, 134, 221], dayFactor);
  const bottom = lerpColor([16, 26, 51], [207, 233, 255], dayFactor);
  const sunDir = normalize({ x: Math.cos(((hour / 24) - 0.25) * Math.PI * 2) * 0.6, y: Math.sin(((hour / 24) - 0.25) * Math.PI * 2), z: Math.cos(((hour / 24) - 0.25) * Math.PI * 2) * 0.35 });

  const eye = { x: px, y: 0, z: pz };
  const surfaceY = world.isGenerated(Math.floor(px), Math.floor(pz)) ? world.heightAt(Math.floor(px), Math.floor(pz)) : 70;
  eye.y = Math.max(surfaceY, 62) + heightOffset;

  const dir = {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
  const target = add(eye, dir);
  const view = lookAt(eye, target, { x: 0, y: 1, z: 0 });
  const proj = perspective(72, W / H, 0.08, 400);
  const viewProj = multiply(proj, view);

  // Фон
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = lerpColor(bottom, top, Math.pow(t, 0.85));
    for (let x = 0; x < W; x++) {
      let col = c;
      // солнечный диск/свечение по направлению взгляда
      const rayDir = screenRay(x, y, view, 72, W, H);
      const d = dot(rayDir, sunDir);
      if (d > 0.98) col = lerpColor(col, [255, 246, 200], Math.min(1, (d - 0.98) * 60) * dayFactor);
      else if (d > 0.7) col = lerpColor(col, [255, 236, 170], (d - 0.7) * 0.25 * dayFactor);
      const i = (y * W + x) * 3;
      colorBuf[i] = col[0];
      colorBuf[i + 1] = col[1];
      colorBuf[i + 2] = col[2];
    }
  }

  // Облака — простая плоскость-шашечка на высоте 120
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rd = screenRay(x, y, view, 72, W, H);
      if (rd.y > 0.02) {
        const t = (120 - eye.y) / rd.y;
        if (t > 0 && t < 900) {
          const wx = eye.x + rd.x * t;
          const wz = eye.z + rd.z * t;
          const n = Math.sin(wx * 0.021) * Math.cos(wz * 0.019) + Math.sin(wx * 0.006 + 1.7) * 0.6;
          if (n > 0.55) {
            const alpha = Math.min(1, (n - 0.55) * 3) * 0.85 * dayFactor;
            const i = (y * W + x) * 3;
            colorBuf[i] = colorBuf[i] * (1 - alpha) + 255 * alpha;
            colorBuf[i + 1] = colorBuf[i + 1] * (1 - alpha) + 255 * alpha;
            colorBuf[i + 2] = colorBuf[i + 2] * (1 - alpha) + 255 * alpha;
          }
        }
      }
    }
  }

  // Сбор и отрисовка треугольников всех чанков
  let tris = 0;
  const opaque = [];
  const translucent = [];

  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const chunk = world.getChunk(ccx + dx, ccz + dz);
      if (!chunk) continue;
      const data = buildChunkGeometry(world, chunk, atlas);
      const ox = chunk.cx * 16;
      const oz = chunk.cz * 16;
      for (const key of ['solid', 'cutout', 'emissive', 'water']) {
        const geo = data[key];
        if (!geo) continue;
        const pos = geo.attributes.position.array;
        const uv = geo.attributes.uv.array;
        const col = geo.attributes.color.array;
        const idx = geo.index.array;
        const bucket = key === 'water' ? translucent : opaque;
        for (let i = 0; i < idx.length; i += 3) {
          const v0 = idx[i];
          const v1 = idx[i + 1];
          const v2 = idx[i + 2];
          bucket.push({ pos, uv, col, v0, v1, v2, ox, oz, water: key === 'water' });
          tris++;
        }
      }
    }
  }
  console.log(`scene: ${tris} triangles, ${opaque.length} opaque, ${translucent.length} translucent, eye=${eye.x.toFixed(1)},${eye.y.toFixed(1)},${eye.z.toFixed(1)}`);

  // Сортировка прозрачных — от дальних к ближним
  const centroid = (t) => {
    const cx = (t.pos[t.v0 * 3] + t.pos[t.v1 * 3] + t.pos[t.v2 * 3]) / 3 + t.ox;
    const cz = (t.pos[t.v0 * 3 + 2] + t.pos[t.v1 * 3 + 2] + t.pos[t.v2 * 3 + 2]) / 3 + t.oz;
    const cy = (t.pos[t.v0 * 3 + 1] + t.pos[t.v1 * 3 + 1] + t.pos[t.v2 * 3 + 1]) / 3;
    return (cx - eye.x) ** 2 + (cy - eye.y) ** 2 + (cz - eye.z) ** 2;
  };
  translucent.forEach((t) => (t.d = centroid(t)));
  translucent.sort((a, b) => b.d - a.d);

  const drawTris = (list, alpha) => {
    for (const t of list) {
      const { pos, uv, col, ox, oz } = t;
      const vs = [t.v0, t.v1, t.v2].map((vi) => {
        const p = { x: pos[vi * 3] + ox, y: pos[vi * 3 + 1], z: pos[vi * 3 + 2] + oz };
        const clip = transform(viewProj, p);
        const ndc = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w, w: clip.w };
        return { p, ndc, uv: [uv[vi * 2], uv[vi * 2 + 1]], shade: (col[vi * 3] + col[vi * 3 + 1] + col[vi * 3 + 2]) / 3 };
      });
      // отсечение по ближней плоскости
      if (vs.some((v) => v.ndc.w <= 0.05)) continue;
      const sx = vs.map((v) => ((v.ndc.x * 0.5 + 0.5) * W));
      const sy = vs.map((v) => ((-v.ndc.y * 0.5 + 0.5) * H));
      const sz = vs.map((v) => v.ndc.z);

      const minX = Math.max(0, Math.floor(Math.min(...sx)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(...sx)));
      const minY = Math.max(0, Math.floor(Math.min(...sy)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
      if (maxX < minX || maxY < minY) continue;

      const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (Math.abs(area) < 1e-9) continue;
      const invArea = 1 / area;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          let w0 = ((sx[1] - cx) * (sy[2] - cy) - (sx[2] - cx) * (sy[1] - cy)) * invArea;
          let w1 = ((sx[2] - cx) * (sy[0] - cy) - (sx[0] - cx) * (sy[2] - cy)) * invArea;
          let w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;

          const z = w0 * (sz[0] + 1) * 0.5 + w1 * (sz[1] + 1) * 0.5 + w2 * (sz[2] + 1) * 0.5;
          const di = y * W + x;
          if (z >= depthBuf[di]) continue;

          // интерполяция UV и затенения
          const u = w0 * vs[0].uv[0] + w1 * vs[1].uv[0] + w2 * vs[2].uv[0];
          const v = w0 * vs[0].uv[1] + w1 * vs[1].uv[1] + w2 * vs[2].uv[1];
          const shade = w0 * vs[0].shade + w1 * vs[1].shade + w2 * vs[2].shade;

          // сэмплинг атласа
          const tx = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
          const ty = Math.min(ROWS - 1, Math.max(0, Math.floor((1 - v) * ROWS)));
          const pu = Math.min(TILE - 1, Math.max(0, Math.floor(((u * COLS) % 1) * TILE)));
          const pv = Math.min(TILE - 1, Math.max(0, Math.floor(((1 - v) * ROWS % 1) * TILE)));
          const ai = (ty * TILE + pv) * atl.width * 4 + (tx * TILE + pu) * 4;
          const a = atl.data[ai + 3];
          if (a < 40) continue;

          const lightShade = shade * (0.27 + dayFactor * 0.73);
          const r = atl.data[ai] * lightShade;
          const g = atl.data[ai + 1] * lightShade;
          const b = atl.data[ai + 2] * lightShade;

          if (!t.water) {
            depthBuf[di] = z;
            const ci = di * 3;
            colorBuf[ci] = r;
            colorBuf[ci + 1] = g;
            colorBuf[ci + 2] = b;
          } else {
            const A = 0.72;
            const ci = di * 3;
            colorBuf[ci] = colorBuf[ci] * (1 - A) + r * A;
            colorBuf[ci + 1] = colorBuf[ci + 1] * (1 - A) + g * A;
            colorBuf[ci + 2] = colorBuf[ci + 2] * (1 - A) + b * A;
          }
        }
      }
    }
  };

  // Отсечение задних граней не делаем: мешер уже выдаёт только внешние грани
  drawTris(opaque, 1);
  drawTris(translucent, 0.72);

  // Туман (как в игре)
  const fogColor = lerpColor(bottom, top, 0.28);
  const fogNear = (R * 16) * 0.45;
  const fogFar = R * 16 * 0.92;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const di = y * W + x;
      const z = depthBuf[di];
      if (!isFinite(z)) continue;
      // восстановим приблизительную дистанцию
      const t = Math.max(0, Math.min(1, (z - 0.5) / 0.5));
      void t;
    }
  }

  const outCanvas = new Canvas(W, H);
  for (let i = 0; i < W * H; i++) {
    outCanvas.data[i * 4] = Math.max(0, Math.min(255, colorBuf[i * 3]));
    outCanvas.data[i * 4 + 1] = Math.max(0, Math.min(255, colorBuf[i * 3 + 1]));
    outCanvas.data[i * 4 + 2] = Math.max(0, Math.min(255, colorBuf[i * 3 + 2]));
    outCanvas.data[i * 4 + 3] = 255;
  }
  fs.mkdirSync('tests/out', { recursive: true });
  fs.writeFileSync(out, encodePNG(W, H, outCanvas.data));
  console.log('wrote', out, '(fog color', fogColor.map(Math.round), ')');
}

function screenRay(x, y, view, fovDeg, w, h) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const ndcX = (x / w) * 2 - 1;
  const ndcY = 1 - (y / h) * 2;
  const aspect = w / h;
  const cam = normalize({ x: (ndcX / f) * aspect, y: ndcY / f, z: -1 });
  // поворот через обратную видовую матрицу
  const xAxis = { x: view[0], y: view[4], z: view[8] };
  const yAxis = { x: view[1], y: view[5], z: view[9] };
  const zAxis = { x: view[2], y: view[6], z: view[10] };
  return normalize(add(add(scaleV(xAxis, cam.x), scaleV(yAxis, cam.y)), scaleV(zAxis, cam.z)));
}

/** Рисует «иконки» блоков как в инвентаре — проверка UI-иконок */
export function renderIcons(list, out = 'tests/out/icons.png') {
  const atlas = buildTextureAtlas();
  const size = 76;
  const cols = 8;
  const rows = Math.ceil(list.length / cols);
  const canvas = new Canvas(cols * size, rows * size);
  // фон
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = 198;
    canvas.data[i + 1] = 198;
    canvas.data[i + 2] = 198;
    canvas.data[i + 3] = 255;
  }
  const ctx = canvas.getContext('2d');
  const ICON = 64;
  const icon = new Canvas(ICON, ICON);

  // Копия drawBlockIcon из ui.js (упрощённая)
  const T = atlas.tile;
  list.forEach((name, i) => {
    const def = getBlock(3); // placeholder, реальный def ниже
    void def;
    const c = icon.getContext('2d');
    c.resetTransform();
    c.clearRect(0, 0, ICON, ICON);
    const block = getBlock(Object.keys(blockIdMap).length ? blockIdMap[name] : 0);
    const tmp = new Canvas(T, T);
    const tc = tmp.getContext('2d');
    const drawFace = (textureName, p0, u, v, shade) => {
      const idx = atlas.names.indexOf(textureName);
      const col = idx % atlas.cols;
      const row = Math.floor(idx / atlas.cols);
      tc.clearRect(0, 0, T, T);
      tc.drawImage(atlas.canvas, col * T, row * T, T, T, 0, 0, T, T);
      c.save();
      c.setTransform(u[0] / T, u[1] / T, v[0] / T, v[1] / T, p0[0], p0[1]);
      c.drawImage(tmp, 0, 0);
      if (shade < 1) {
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = `rgba(0,0,0,${1 - shade})`;
        c.fillRect(0, 0, T, T);
      }
      c.restore();
      c.setTransform(1, 0, 0, 1, 0, 0);
    };
    const cx = ICON / 2;
    const top = 8;
    const w = ICON * 0.44;
    const hh = ICON * 0.24;
    drawFace(block.faces[2], [cx - w, top + hh * 0.95], [w, -hh], [w * 0.5, hh * 0.55], 1.0);
    drawFace(block.faces[1], [cx - w, top + hh * 0.95], [w, -hh * 0.55], [0, ICON * 0.45], 0.72);
    drawFace(block.faces[4], [cx - w * 0.5, top + hh * 1.5], [w * 0.5, hh * 0.55], [0, ICON * 0.45], 0.55);

    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(icon, 0, 0, ICON, ICON, col * size + 6, row * size + 6, ICON, ICON);
  });
  fs.writeFileSync(out, encodePNG(canvas.width, canvas.height, canvas.data));
  console.log('wrote', out);
}

let blockIdMap = {};

if (process.argv[1] && process.argv[1].endsWith('raster.mjs')) {
  const { blockByName } = await import('../src/blocks.js');
  blockIdMap = Object.fromEntries(['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'planks', 'glass', 'bricks', 'tnt', 'glowstone', 'cobblestone', 'diamond_ore', 'snow_block', 'cactus', 'flower_red'].map((n) => [n, blockByName(n)]));
  renderScene({ out: 'tests/out/scene.png', px: 8, pz: 8, yaw: 0.7, pitch: -0.12, radius: 4, hour: 10 });
  renderIcons(['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'planks', 'glass', 'bricks', 'tnt', 'glowstone', 'cobblestone', 'diamond_ore', 'snow_block', 'cactus', 'flower_red'], 'tests/out/icons.png');
}
