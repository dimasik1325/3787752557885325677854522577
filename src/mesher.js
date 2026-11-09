import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from './config.js';
import { AIR, getBlock } from './blocks.js';

// Порядок обхода вершин — против часовой стрелки (видно снаружи грани)
const FACE_DEFS = [
  { n: [1, 0, 0], axisU: 2, axisV: 1, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], face: 0, shade: 0.82 },
  { n: [-1, 0, 0], axisU: 2, axisV: 1, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], face: 1, shade: 0.82 },
  { n: [0, 1, 0], axisU: 0, axisV: 2, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], face: 2, shade: 1.0 },
  { n: [0, -1, 0], axisU: 0, axisV: 2, corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], face: 3, shade: 0.55 },
  { n: [0, 0, 1], axisU: 0, axisV: 1, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], face: 4, shade: 0.92 },
  { n: [0, 0, -1], axisU: 0, axisV: 1, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], face: 5, shade: 0.92 },
];

const FACE_UVS = [[0, 0], [0, 1], [1, 1], [1, 0]];

const CROSS_QUADS = [
  [[0.1, 0, 0.1], [0.1, 1, 0.1], [0.9, 1, 0.9], [0.9, 0, 0.9]],
  [[0.9, 0, 0.1], [0.9, 1, 0.1], [0.1, 1, 0.9], [0.1, 0, 0.9]],
];

// AO-смещения по каждой грани/вершине
const AO_OFFSETS = FACE_DEFS.map((def) =>
  def.corners.map((corner) => {
    const du = corner[def.axisU] === 1 ? 1 : -1;
    const dv = corner[def.axisV] === 1 ? 1 : -1;
    const uOff = [0, 0, 0];
    const vOff = [0, 0, 0];
    uOff[def.axisU] = du;
    vOff[def.axisV] = dv;
    return {
      s1: [def.n[0] + uOff[0], def.n[1] + uOff[1], def.n[2] + uOff[2]],
      s2: [def.n[0] + vOff[0], def.n[1] + vOff[1], def.n[2] + vOff[2]],
      c: [def.n[0] + uOff[0] + vOff[0], def.n[1] + uOff[1] + vOff[1], def.n[2] + uOff[2] + vOff[2]],
    };
  })
);

const AO_CURVE = [0.52, 0.7, 0.86, 1.0];

// ---- Параметры «расширенного» (padded) массива чанка ----
const PAD = 1;
const PW = CHUNK_SIZE + PAD * 2; // 18
const PH = WORLD_HEIGHT + PAD * 2; // 130
const PLANE = PW * PW;
const PAD_SIZE = PLANE * PH;

/** Переиспользуемые буферы — чтобы не аллоцировать при каждом чанке */
let paddedBlocks = new Uint8Array(PAD_SIZE);
let paddedLight = new Uint8Array(PAD_SIZE);
let paddedSolid = new Uint8Array(PAD_SIZE);

const pIdx = (x, y, z) => x + PAD + (z + PAD) * PW + (y + PAD) * PLANE;

/** Заполняет padded-массивы блоков/света/твёрдости из чанка и его соседей */
function fillPadded(world, chunk) {
  paddedBlocks.fill(0);
  paddedLight.fill(0);
  paddedSolid.fill(0);

  for (let pz = 0; pz < PW; pz++) {
    const dz = pz === 0 ? -1 : pz === PW - 1 ? 1 : 0;
    const lz = pz - PAD;
    for (let px = 0; px < PW; px++) {
      const dx = px === 0 ? -1 : px === PW - 1 ? 1 : 0;
      const lx = px - PAD;

      let src = chunk;
      if (dx !== 0 || dz !== 0) src = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!src || !src.generated) continue;

      const blocks = src.blocks;
      const light = src.light;
      const base = pIdx(px - PAD, 0, pz - PAD);
      const srcBase = lx + lz * CHUNK_SIZE;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const sb = blocks[srcBase + y * 256];
        const pi = base + y * PLANE;
        paddedBlocks[pi] = sb;
        paddedLight[pi] = light[srcBase + y * 256];
        if (sb !== AIR) {
          const def = getBlock(sb);
          if (def.solid && !def.liquid) paddedSolid[pi] = 1;
        }
      }
    }
  }
}

class MeshBuilder {
  constructor(capacity = 4096) {
    this.positions = new Float32Array(capacity * 3);
    this.uvs = new Float32Array(capacity * 2);
    this.colors = new Float32Array(capacity * 3);
    this.indices = new Uint32Array(Math.ceil(capacity * 1.5));
    this.vCount = 0;
    this.iCount = 0;
    this.capacity = capacity;
  }

  ensure(extraVerts) {
    if (this.vCount + extraVerts <= this.capacity) return;
    let cap = this.capacity;
    while (this.vCount + extraVerts > cap) cap *= 2;
    const grow = (arr, n) => {
      const next = new arr.constructor(n);
      next.set(arr);
      return next;
    };
    this.positions = grow(this.positions, cap * 3);
    this.uvs = grow(this.uvs, cap * 2);
    this.colors = grow(this.colors, cap * 3);
    this.indices = grow(this.indices, Math.ceil(cap * 1.5));
    this.capacity = cap;
  }

  quad(verts, uvs, colors) {
    this.ensure(4);
    const base = this.vCount;
    const P = this.positions;
    const U = this.uvs;
    const C = this.colors;
    for (let i = 0; i < 4; i++) {
      const p = (base + i) * 3;
      P[p] = verts[i][0];
      P[p + 1] = verts[i][1];
      P[p + 2] = verts[i][2];
      const u = (base + i) * 2;
      U[u] = uvs[i][0];
      U[u + 1] = uvs[i][1];
      C[p] = colors[i][0];
      C[p + 1] = colors[i][1];
      C[p + 2] = colors[i][2];
    }
    const ind = this.indices;
    ind[this.iCount++] = base;
    ind[this.iCount++] = base + 1;
    ind[this.iCount++] = base + 2;
    ind[this.iCount++] = base;
    ind[this.iCount++] = base + 2;
    ind[this.iCount++] = base + 3;
    this.vCount += 4;
  }

  isEmpty() {
    return this.iCount === 0;
  }

  build() {
    if (this.iCount === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions.slice(0, this.vCount * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs.slice(0, this.vCount * 2), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors.slice(0, this.vCount * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(this.indices.slice(0, this.iCount), 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * Строит геометрию чанка в 4 корзины: непрозрачное, растения, вода, светящееся.
 */
export function buildChunkGeometry(world, chunk, atlas) {
  fillPadded(world, chunk);

  const solid = new MeshBuilder(6000);
  const cutout = new MeshBuilder(1500);
  const water = new MeshBuilder(800);
  const emissive = new MeshBuilder(300);

  const maxY = Math.min(chunk.maxY, WORLD_HEIGHT - 2);
  const PB = paddedBlocks;
  const PL = paddedLight;
  const PS = paddedSolid;

  for (let y = 0; y <= maxY; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      let pi = pIdx(0, y, lz);
      for (let lx = 0; lx < CHUNK_SIZE; lx++, pi++) {
        const id = PB[pi];
        if (id === AIR) continue;

        const def = getBlock(id);

        // --- Растения крестиком ---
        if (def.cross) {
          const uvRect = atlas.uv(def.faces[0]);
          const uvs = [];
          for (let k = 0; k < 4; k++) {
            uvs.push([
              uvRect[0] + FACE_UVS[k][0] * (uvRect[2] - uvRect[0]),
              uvRect[1] + FACE_UVS[k][1] * (uvRect[3] - uvRect[1]),
            ]);
          }
          const l = PL[pi];
          const b = 0.12 + 0.88 * Math.pow(l / 15, 1.15);
          const col = [[b, b, b], [b, b, b], [b, b, b], [b, b, b]];
          for (const q of CROSS_QUADS) {
            cutout.quad(
              q.map((c) => [lx + c[0], y + c[1], lz + c[2]]),
              uvs,
              col
            );
          }
          continue;
        }

        // --- Вода ---
        if (def.liquid) {
          const uvRect = atlas.uv(def.faces[2]);
          const uvs = [];
          for (let k = 0; k < 4; k++) {
            uvs.push([
              uvRect[0] + FACE_UVS[k][0] * (uvRect[2] - uvRect[0]),
              uvRect[1] + FACE_UVS[k][1] * (uvRect[3] - uvRect[1]),
            ]);
          }
          for (let f = 0; f < 6; f++) {
            const fd = FACE_DEFS[f];
            const ni = pi + (fd.n[1] !== 0 ? fd.n[1] * PLANE : 0) + (fd.n[2] !== 0 ? fd.n[2] * PW : 0) + fd.n[0];
            const nid = PB[ni];
            if (nid !== AIR) {
              const nd = getBlock(nid);
              if (nd.opaque || nd.liquid) continue;
            }
            const l = Math.max(PL[pi], PL[ni]);
            const b = (0.14 + 0.86 * Math.pow(l / 15, 1.2)) * fd.shade;
            const col = [[b, b, b], [b, b, b], [b, b, b], [b, b, b]];
            const verts = fd.corners.map((c) => [
              lx + c[0],
              y + c[1] + (c[1] === 1 ? -0.12 : 0),
              lz + c[2],
            ]);
            water.quad(verts, uvs, col);
          }
          continue;
        }

        // --- Обычные блоки ---
        const isEmissive = def.light > 0;
        const builder = isEmissive ? emissive : def.cutout ? cutout : solid;
        const isSelfTransparent = def.transparent || def.cutout;

        for (let f = 0; f < 6; f++) {
          const fd = FACE_DEFS[f];
          const ni = pi + (fd.n[1] !== 0 ? fd.n[1] * PLANE : 0) + (fd.n[2] !== 0 ? fd.n[2] * PW : 0) + fd.n[0];
          const nid = PB[ni];

          if (nid !== AIR) {
            const nd = getBlock(nid);
            if (nd.opaque) continue;
            if (nid === id && isSelfTransparent) continue;
          }

          const uvRect = atlas.uv(def.faces[fd.face]);
          const uvs = [
            [uvRect[0], uvRect[1]],
            [uvRect[0], uvRect[3]],
            [uvRect[2], uvRect[3]],
            [uvRect[2], uvRect[1]],
          ];

          const lightBase = isEmissive ? 15 : Math.max(PL[pi], PL[ni]);
          // в темноте пещер оставляем минимум, чтобы контуры читались
          const baseBright = 0.1 + 0.9 * Math.pow(lightBase / 15, 1.15);
          const shade = fd.shade;
          const colors = [];

          const aoEnabled = !def.cutout && !def.transparent;
          for (let vi = 0; vi < 4; vi++) {
            let ao = 1;
            if (aoEnabled) {
              const off = AO_OFFSETS[f][vi];
              const s1 = PS[ni + off.s1[1] * PLANE + off.s1[2] * PW + off.s1[0]];
              const s2 = PS[ni + off.s2[1] * PLANE + off.s2[2] * PW + off.s2[0]];
              const sc = PS[ni + off.c[1] * PLANE + off.c[2] * PW + off.c[0]];
              const level = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
              ao = AO_CURVE[level];
            }
            const b = baseBright * shade * ao;
            colors.push([b, b, b]);
          }

          builder.quad(
            fd.corners.map((c) => [lx + c[0], y + c[1], lz + c[2]]),
            uvs,
            colors
          );
        }
      }
    }
  }

  return {
    solid: solid.build(),
    cutout: cutout.build(),
    water: water.build(),
    emissive: emissive.build(),
    faceCount: (solid.iCount + cutout.iCount + water.iCount + emissive.iCount) / 6,
  };
}

export function disposeGeometry(chunk) {
  for (const key of ['solidGeo', 'cutoutGeo', 'waterGeo', 'emissiveGeo']) {
    if (chunk[key]) {
      chunk[key].dispose();
      chunk[key] = null;
    }
  }
}
