// Процедурная генерация пиксельных текстур (16x16) в стиле Minecraft.
// Всё рисуется кодом на canvas — никаких внешних картинок не нужно.

const TILE = 16;
const COLS = 8;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(size = TILE) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** Создаёт текстуру, вызывая painter(set, rand, ctx) */
function paint(painter, size = TILE) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  };
  const setHex = (x, y, hex, a = 255) => {
    const [r, g, b] = hexToRgb(hex);
    set(x, y, r, g, b, a);
  };
  const rand = mulberryRandom(1234567);
  painter(set, rand, ctx, setHex);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function mulberryRandom(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Заливка шумом из палитры */
function fillNoise(set, rand, palette, weights = null, alpha = 255) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let pick;
      if (weights) {
        let r = rand();
        pick = palette[0];
        for (let i = 0; i < palette.length; i++) {
          if (r < weights[i]) return; // заглушка, не используется
        }
        pick = palette[Math.floor(rand() * palette.length)];
      } else {
        pick = palette[Math.floor(rand() * palette.length)];
      }
      const [r, g, b] = hexToRgb(pick);
      set(x, y, r, g, b, alpha);
    }
  }
}

function blobs(set, rand, palette, count, minSize = 1, maxSize = 3) {
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rand() * TILE);
    const cy = Math.floor(rand() * TILE);
    const w = minSize + Math.floor(rand() * (maxSize - minSize + 1));
    const h = minSize + Math.floor(rand() * (maxSize - minSize + 1));
    const [r, g, b] = hexToRgb(palette[Math.floor(rand() * palette.length)]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        set((cx + x) % TILE, (cy + y) % TILE, r, g, b, 255);
      }
    }
  }
}

const TEXTURES = {
  grass_top: (set, rand) => {
    fillNoise(set, rand, ['#69a83e', '#74b446', '#5f9c36', '#7cbc4e', '#639f3a']);
    blobs(set, rand, ['#82c455', '#57922f'], 10, 1, 2);
  },
  dirt: (set, rand) => {
    fillNoise(set, rand, ['#8b5a3c', '#946441', '#7d5033', '#9c6d47', '#845539']);
    blobs(set, rand, ['#6d472e', '#a1734c'], 12, 1, 2);
  },
  grass_side: (set, rand) => {
    fillNoise(set, rand, ['#8b5a3c', '#946441', '#7d5033', '#9c6d47', '#845539']);
    blobs(set, rand, ['#6d472e', '#a1734c'], 10, 1, 2);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + Math.floor(rand() * 3);
      for (let y = 0; y < h; y++) {
        const [r, g, b] = hexToRgb(['#69a83e', '#74b446', '#5f9c36'][Math.floor(rand() * 3)]);
        set(x, y, r, g, b);
      }
    }
  },
  snow_side: (set, rand) => {
    fillNoise(set, rand, ['#8b5a3c', '#946441', '#7d5033', '#9c6d47']);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + Math.floor(rand() * 2);
      for (let y = 0; y < h; y++) {
        const [r, g, b] = hexToRgb(['#f4fbff', '#e7f2f8', '#ffffff'][Math.floor(rand() * 3)]);
        set(x, y, r, g, b);
      }
    }
  },
  stone: (set, rand) => {
    fillNoise(set, rand, ['#8e8e8e', '#969696', '#878787', '#9d9d9d', '#828282']);
    blobs(set, rand, ['#7a7a7a', '#a5a5a5'], 8, 1, 3);
  },
  cobblestone: (set, rand) => {
    fillNoise(set, rand, ['#7b7b7b', '#858585']);
    // «булыжники» — прямоугольники со швами
    const cells = [
      [0, 0, 7, 4], [8, 0, 8, 5], [0, 6, 4, 4], [5, 6, 6, 5],
      [12, 6, 4, 5], [0, 11, 8, 5], [9, 12, 7, 4],
    ];
    for (const [cx, cy, w, h] of cells) {
      const base = ['#8f8f8f', '#9b9b9b', '#868686', '#a2a2a2'][Math.floor(rand() * 4)];
      const [r, g, b] = hexToRgb(base);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const shade = 1 + (rand() - 0.5) * 0.14;
          set(cx + x, cy + y, Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade));
        }
      }
    }
  },
  bedrock: (set, rand) => {
    fillNoise(set, rand, ['#3b3b3b', '#4a4a4a', '#2e2e2e', '#565656', '#333333']);
    blobs(set, rand, ['#1f1f1f', '#666666'], 10, 1, 3);
  },
  sand: (set, rand) => {
    fillNoise(set, rand, ['#ded29a', '#e7dca6', '#d6c98f', '#efe6b8']);
    blobs(set, rand, ['#c9bb80', '#f4ecc4'], 8, 1, 2);
  },
  sandstone_side: (set, rand) => {
    fillNoise(set, rand, ['#d9cd96', '#e2d7a3']);
    for (let y = 0; y < TILE; y++) {
      if (y < 4) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = hexToRgb('#e9dfae');
          set(x, y, r, g, b);
        }
      } else if (y === 4 || y === 11) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = hexToRgb('#c4b67f');
          set(x, y, r, g, b);
        }
      }
    }
  },
  water: (set, rand) => {
    fillNoise(set, rand, ['#3f74d6', '#4479dc', '#3a6cce', '#4a80e2']);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      for (let k = 0; k < 3; k++) {
        const [r, g, b] = hexToRgb('#5b8ee8');
        set((x + k) % TILE, y, r, g, b);
      }
    }
  },
  log_side: (set, rand) => {
    fillNoise(set, rand, ['#7a5a34', '#836139', '#71522f', '#8a6740']);
    for (let x = 0; x < TILE; x++) {
      if (x % 4 === 0) {
        for (let y = 0; y < TILE; y++) {
          const [r, g, b] = hexToRgb('#5f4426');
          set(x, y, r, g, b);
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      set(x, y, 90, 68, 40);
    }
  },
  log_top: (set, rand) => {
    fillNoise(set, rand, ['#b08b53', '#a8834b']);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ring = Math.floor(dist) % 3;
        if (ring === 0) {
          const [r, g, b] = hexToRgb('#8a6a3c');
          set(x, y, r, g, b);
        } else if (dist > 7.2) {
          const [r, g, b] = hexToRgb('#6f5330');
          set(x, y, r, g, b);
        }
      }
    }
  },
  leaves: (set, rand) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const r0 = rand();
        if (r0 < 0.1) {
          set(x, y, 0, 0, 0, 0); // дырка
          continue;
        }
        const pal = ['#3f7a32', '#4a8a3a', '#356b2a', '#54963f', '#2e5f26'];
        const [r, g, b] = hexToRgb(pal[Math.floor(rand() * pal.length)]);
        set(x, y, r, g, b);
      }
    }
  },
  planks: (set, rand) => {
    fillNoise(set, rand, ['#b28d55', '#ba9560', '#a8844c']);
    for (let y = 0; y < TILE; y++) {
      if (y % 4 === 3) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = hexToRgb('#8d6c3d');
          set(x, y, r, g, b);
        }
      }
    }
    for (let band = 0; band < 4; band++) {
      const x = (band * 5 + 3) % TILE;
      const y0 = band * 4;
      for (let y = y0; y < y0 + 3; y++) {
        const [r, g, b] = hexToRgb('#9a7847');
        set(x, y, r, g, b);
      }
    }
  },
  glass: (set, rand) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (edge) set(x, y, 214, 240, 250, 255);
        else if ((x + y) % 7 === 0) set(x, y, 228, 246, 252, 200);
        else set(x, y, 205, 235, 248, 90);
      }
    }
  },
  snow: (set, rand) => {
    fillNoise(set, rand, ['#f4fbff', '#eaf4fa', '#ffffff', '#dfeef7']);
    blobs(set, rand, ['#ffffff', '#d8e9f4'], 8, 1, 2);
  },
  ice: (set, rand) => {
    fillNoise(set, rand, ['#a8d8f5', '#b6e1fa', '#9ccfee']);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rand() * TILE);
      for (let y = 0; y < TILE; y++) {
        const [r, g, b] = hexToRgb('#c9ebff');
        set((x + Math.floor(y / 3)) % TILE, y, r, g, b);
      }
    }
  },
  bricks: (set, rand) => {
    fillNoise(set, rand, ['#a8452f', '#b04b34']);
    const mortar = '#d8d0c4';
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const row = Math.floor(y / 4);
        const offset = row % 2 === 0 ? 0 : 4;
        const isMortar = y % 4 === 3 || (x + offset) % 8 === 7;
        if (isMortar) {
          const [r, g, b] = hexToRgb(mortar);
          set(x, y, r, g, b);
        }
      }
    }
  },
  tnt_side: (set, rand, ctx, setHex) => {
    fillNoise(set, rand, ['#c2382b', '#cc4032', '#b53226']);
    for (let y = 4; y < 12; y++) {
      for (let x = 0; x < TILE; x++) {
        set(x, y, 240, 240, 236);
      }
    }
    // буквы TNT "пиксельным" способом
    const letters = [
      [1, '###', '.#.', '.#.'],
      [5, '#.#', '###', '#.#'],
      [10, '###', '.#.', '.#.'],
    ];
    for (const [lx, ...rows] of letters) {
      rows.forEach((row, ry) => {
        for (let cx = 0; cx < row.length; cx++) {
          if (row[cx] === '#') set(lx + cx, 5 + ry, 40, 40, 40);
        }
      });
    }
  },
  tnt_top: (set, rand) => {
    fillNoise(set, rand, ['#c2382b', '#cc4032']);
    for (let y = 6; y < 10; y++) {
      for (let x = 6; x < 10; x++) {
        set(x, y, 60, 60, 60);
      }
    }
    set(7, 7, 180, 180, 180);
    set(8, 8, 180, 180, 180);
  },
  tnt_bottom: (set, rand) => {
    fillNoise(set, rand, ['#c2382b', '#cc4032', '#b53226']);
  },
  glowstone: (set, rand) => {
    fillNoise(set, rand, ['#f0c85a', '#e8bd4a', '#f7d774']);
    blobs(set, rand, ['#fff0a8', '#d9a63a', '#ffe89a'], 12, 1, 2);
  },
  coal_ore: (set, rand) => {
    TEXTURES.stone(set, rand);
    blobs(set, rand, ['#262626', '#1a1a1a', '#333333'], 7, 1, 2);
  },
  iron_ore: (set, rand) => {
    TEXTURES.stone(set, rand);
    blobs(set, rand, ['#d8a88a', '#c08f6f', '#e8bd9e'], 7, 1, 2);
  },
  gold_ore: (set, rand) => {
    TEXTURES.stone(set, rand);
    blobs(set, rand, ['#f8d84a', '#e8c22a', '#ffe870'], 7, 1, 2);
  },
  diamond_ore: (set, rand) => {
    TEXTURES.stone(set, rand);
    blobs(set, rand, ['#5ce8e0', '#36d4cc', '#9ef4ee'], 7, 1, 2);
  },
  gravel: (set, rand) => {
    fillNoise(set, rand, ['#8a8782', '#9b9791', '#7a7772', '#a8a49e', '#6e6b66']);
    blobs(set, rand, ['#5f5c58', '#b5b1aa'], 12, 1, 3);
  },
  cactus_side: (set, rand) => {
    fillNoise(set, rand, ['#3f8f3a', '#479a41', '#398234']);
    for (let x = 0; x < TILE; x += 5) {
      for (let y = 0; y < TILE; y++) {
        const [r, g, b] = hexToRgb('#2e6f2a');
        set(x, y, r, g, b);
      }
    }
    for (let i = 0; i < 10; i++) {
      set(Math.floor(rand() * TILE), Math.floor(rand() * TILE), 230, 240, 210);
    }
  },
  cactus_top: (set, rand) => {
    fillNoise(set, rand, ['#4a9c44', '#3f8f3a']);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) set(x, y, 46, 111, 42);
      }
    }
  },
  tall_grass: (set, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, 0, 0, 0, 0);
    for (let i = 0; i < 12; i++) {
      const x = 1 + Math.floor(rand() * 14);
      const h = 4 + Math.floor(rand() * 9);
      for (let k = 0; k < h; k++) {
        const y = TILE - 1 - k;
        const pal = ['#4f9a3a', '#5aa842', '#3f8330'];
        const [r, g, b] = hexToRgb(pal[Math.floor(rand() * 3)]);
        set(x, y, r, g, b);
      }
    }
  },
  torch: (set, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, 0, 0, 0, 0);
    // палка
    for (let y = 6; y < TILE; y++) {
      for (let x = 7; x < 9; x++) {
        const [r, g, b] = hexToRgb(y % 3 === 0 ? '#6b4a2a' : '#7d5832');
        set(x, y, r, g, b);
      }
    }
    // пламя
    const flame = [
      [7, 2, 255, 250, 200], [8, 2, 255, 240, 160],
      [7, 3, 255, 236, 120], [8, 3, 255, 246, 170],
      [7, 4, 255, 205, 70], [8, 4, 255, 220, 90],
      [7, 5, 250, 160, 40], [8, 5, 250, 175, 50],
      [6, 3, 240, 170, 60], [9, 4, 240, 170, 60],
    ];
    for (const [x, y, r, g, b] of flame) set(x, y, r, g, b);
  },
  flower_red: (set, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, 0, 0, 0, 0);
    for (let y = 8; y < TILE; y++) set(7, y, 76, 140, 52);
    set(6, 11, 90, 160, 60);
    set(9, 9, 90, 160, 60);
    const petals = [
      [7, 3], [6, 4], [8, 4], [7, 4], [7, 5], [5, 5], [9, 5], [6, 3], [8, 3], [6, 6], [8, 6], [7, 6],
    ];
    for (const [x, y] of petals) set(x, y, 214, 58, 58);
    set(7, 4, 250, 220, 90);
    set(7, 5, 250, 220, 90);
  },
  flower_yellow: (set, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, 0, 0, 0, 0);
    for (let y = 8; y < TILE; y++) set(7, y, 76, 140, 52);
    set(6, 11, 90, 160, 60);
    const petals = [[7, 3], [6, 4], [8, 4], [7, 4], [7, 5], [5, 5], [9, 5], [6, 6], [8, 6]];
    for (const [x, y] of petals) set(x, y, 240, 210, 70);
    set(7, 4, 180, 140, 30);
  },
};

function woolTexture(base, dark, light) {
  return (set, rand) => {
    fillNoise(set, rand, [base, base, dark, light]);
    blobs(set, rand, [dark, light], 6, 1, 2);
  };
}

TEXTURES.wool_white = woolTexture('#e9ecef', '#d5d9dc', '#f7f9fa');
TEXTURES.wool_red = woolTexture('#b02e2b', '#952220', '#c93c38');
TEXTURES.wool_orange = woolTexture('#e07a1f', '#c46516', '#f29240');
TEXTURES.wool_yellow = woolTexture('#e8c72a', '#cfb01c', '#f7dc55');
TEXTURES.wool_lime = woolTexture('#5fbf2a', '#4ba01d', '#7cd94a');
TEXTURES.wool_blue = woolTexture('#2c4bb0', '#223c95', '#3c62c9');
TEXTURES.wool_purple = woolTexture('#7525a0', '#5e1a83', '#8f3cbb');
TEXTURES.wool_black = woolTexture('#2a2a2a', '#1d1d1d', '#3d3d3d');

/**
 * Собирает атлас текстур: возвращает canvas, размеры и функции UV.
 */
export function buildTextureAtlas() {
  const names = Object.keys(TEXTURES);
  const rows = Math.ceil(names.length / COLS);
  const canvas = makeCanvas(TILE * COLS);
  canvas.height = TILE * rows;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const index = new Map();
  names.forEach((name, i) => {
    const tile = paint(TEXTURES[name]);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    ctx.drawImage(tile, col * TILE, row * TILE);
    index.set(name, i);
  });

  const EPS = 0.02 / COLS; // защита от «просачивания» соседних тайлов

  function uv(name) {
    const i = index.get(name);
    if (i === undefined) throw new Error('Нет текстуры: ' + name);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const u0 = (col + EPS) / COLS;
    const u1 = (col + 1 - EPS) / COLS;
    const v1 = 1 - (row + EPS) / rows;
    const v0 = 1 - (row + 1 - EPS) / rows;
    return [u0, v0, u1, v1];
  }

  return { canvas, cols: COLS, rows, tile: TILE, uv, names };
}
