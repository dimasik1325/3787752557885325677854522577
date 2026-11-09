import { getBlock, blockByName, CREATIVE_CATEGORIES } from './blocks.js';
import { RECIPES, STACK_SIZE } from './inventory.js';

const ICON_SIZE = 64;

/** Рисует изометрический «кубик» блока из атласа */
export function drawBlockIcon(canvas, blockId, atlas) {
  const ctx = canvas.getContext('2d');
  const size = ICON_SIZE;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const def = getBlock(blockId);
  if (!def || def.id === 0) return;

  const tile = atlas.tile;
  const tmp = document.createElement('canvas');
  tmp.width = tile;
  tmp.height = tile;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  tctx.setTransform(1, 0, 0, 1, 0, 0);

  const copyTile = (textureName) => {
    const idx = atlas.names.indexOf(textureName);
    if (idx < 0) return false;
    const col = idx % atlas.cols;
    const row = Math.floor(idx / atlas.cols);
    tctx.clearRect(0, 0, tile, tile);
    tctx.drawImage(atlas.canvas, col * tile, row * tile, tile, tile, 0, 0, tile, tile);
    return true;
  };

  // Растения: просто картинка по центру
  if (def.cross) {
    if (!copyTile(def.faces[0])) return;
    ctx.drawImage(tmp, 4, 0, size - 8, size - 4);
    return;
  }

  // Изометрический «кубик»: верхний ромб + две боковые грани
  const S = size / 64;
  const A = [32 * S, 5 * S]; // верх
  const B = [60 * S, 19 * S]; // правый
  const C = [32 * S, 33 * S]; // низ ромба
  const D = [4 * S, 19 * S]; // левый
  const sideH = 23 * S;

  // ctx.setTransform(a,b,c,d,e,f): x' = a*x + c*y + e ; y' = b*x + d*y + f
  const face = (textureName, ox, oy, ux, uy, vx, vy, shade) => {
    if (!copyTile(textureName)) return;
    ctx.save();
    ctx.setTransform(ux / tile, uy / tile, vx / tile, vy / tile, ox, oy);
    ctx.drawImage(tmp, 0, 0);
    if (shade < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${(1 - shade).toFixed(3)})`;
      ctx.fillRect(0, 0, tile, tile);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // верхняя грань
  face(def.faces[2], A[0], A[1], B[0] - A[0], B[1] - A[1], D[0] - A[0], D[1] - A[1], 1.0);
  // левая грань
  face(def.faces[1], D[0], D[1], C[0] - D[0], C[1] - D[1], 0, sideH, 0.74);
  // правая грань
  face(def.faces[4], C[0], C[1], B[0] - C[0], B[1] - C[1], 0, sideH, 0.56);
}

function makeHeartTexture(fill) {
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = 18;
  const ctx = c.getContext('2d');
  const rows = [
    '..XX..XX..',
    '.XXXX.XXXX',
    'XXXXXXXXXX',
    'XXXXXXXXXX',
    'XXXXXXXXXX',
    '.XXXXXXXX.',
    '..XXXXXX..',
    '...XXXX...',
    '....XX....',
  ];
  const scale = 2;
  const colors = {
    full: ['#e02a2a', '#a01515'],
    half: ['#e02a2a', '#3a3a3a'],
    empty: ['#3a3a3a', '#2a2a2a'],
  };
  const [main, second] = colors[fill] || colors.full;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      const isRightHalf = x >= 5;
      const color = fill === 'half' && isRightHalf ? second : main;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale - 1, y * scale, scale, scale);
    });
  });
  return c;
}

function makeBubbleTexture(fill) {
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = 18;
  const ctx = c.getContext('2d');
  const rows = ['..XXXX..', '.XXXXXX.', 'XX.XXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = fill ? 'rgba(160,220,255,0.95)' : 'rgba(50,80,110,0.6)';
      ctx.fillRect(x * 2 + 1, y * 2 + 1, 2, 2);
    });
  });
  return c;
}

export class UI {
  constructor(atlas, inventory) {
    this.atlas = atlas;
    this.inventory = inventory;
    this.toastTimers = [];
    this.lastToast = '';
    this.heartCache = {
      full: makeHeartTexture('full'),
      half: makeHeartTexture('half'),
      empty: makeHeartTexture('empty'),
    };
    this.bubbleFull = makeBubbleTexture(true);
    this.bubbleEmpty = makeBubbleTexture(false);
    this.hotbarEl = document.getElementById('hotbar');
    this.heartsEl = document.getElementById('hearts');
    this.bubblesEl = document.getElementById('bubbles');
    this.labelEl = document.getElementById('selected-label');
    this.debugEl = document.getElementById('debug-panel');
    this.slotEls = [];
    this.buildHotbar();
  }

  buildHotbar() {
    this.hotbarEl.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.inventory.selected ? ' active' : '');
      const canvas = document.createElement('canvas');
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const count = document.createElement('span');
      count.className = 'count';
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(i + 1);
      slot.appendChild(canvas);
      slot.appendChild(count);
      slot.appendChild(idx);
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSlotClick?.(i);
      });
      this.hotbarEl.appendChild(slot);
      this.slotEls.push({ slot, canvas, count });
    }
    this.refreshHotbar();
  }

  refreshHotbar() {
    for (let i = 0; i < 9; i++) {
      const { slot, canvas, count } = this.slotEls[i];
      const item = this.inventory.slots[i];
      slot.classList.toggle('active', i === this.inventory.selected);
      if (item) {
        drawBlockIcon(canvas, item.id, this.atlas);
        count.textContent = this.inventory.creative ? '' : item.count > 1 ? String(item.count) : '';
      } else {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        count.textContent = '';
      }
    }
    const sel = this.inventory.selectedItem;
    if (sel) {
      this.labelEl.textContent = getBlock(sel.id).label;
      this.labelEl.classList.add('show');
      clearTimeout(this.labelTimeout);
      this.labelTimeout = setTimeout(() => this.labelEl.classList.remove('show'), 1600);
    }
  }

  setSelected(index) {
    this.inventory.selected = ((index % 9) + 9) % 9;
    this.refreshHotbar();
    this.onSelectionChange?.(this.inventory.selectedItem);
  }

  updateVitals(player) {
    const totalHearts = 10;
    const health = player.dead ? 0 : player.health;
    if (this._lastHearts !== health) {
      this._lastHearts = health;
      this.heartsEl.innerHTML = '';
      for (let i = 0; i < totalHearts; i++) {
        const value = health - i * 2;
        const canvas = document.createElement('canvas');
        canvas.className = 'heart';
        const src = value >= 2 ? this.heartCache.full : value >= 1 ? this.heartCache.half : this.heartCache.empty;
        canvas.width = 18;
        canvas.height = 18;
        canvas.getContext('2d').drawImage(src, 0, 0);
        this.heartsEl.appendChild(canvas);
      }
    }

    const bubbles = Math.ceil((player.breath / player.maxBreath) * 10);
    if (this._lastBubbles !== bubbles) {
      this._lastBubbles = bubbles;
      this.bubblesEl.innerHTML = '';
      if (bubbles < 10) {
        for (let i = 0; i < 10; i++) {
          const canvas = document.createElement('canvas');
          canvas.className = 'bubble';
          canvas.width = 18;
          canvas.height = 18;
          canvas.getContext('2d').drawImage(i < bubbles ? this.bubbleFull : this.bubbleEmpty, 0, 0);
          this.bubblesEl.appendChild(canvas);
        }
      }
    }
  }

  setDebug({ fps, pos, biome, block, chunks, time, mode, visible }) {
    this.debugEl.classList.toggle('hidden', !visible);
    if (!visible) return;
    document.getElementById('dbg-fps').textContent = Math.round(fps);
    document.getElementById('dbg-pos').textContent = `${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}`;
    document.getElementById('dbg-biome').textContent = biome;
    document.getElementById('dbg-block').textContent = block;
    document.getElementById('dbg-chunks').textContent = chunks;
    document.getElementById('dbg-time').textContent = time;
    document.getElementById('dbg-mode').textContent = mode;
  }

  toast(text, iconBlockId = null) {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast';
    if (iconBlockId) {
      const canvas = document.createElement('canvas');
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      canvas.style.width = '20px';
      canvas.style.height = '20px';
      canvas.style.verticalAlign = 'middle';
      canvas.style.marginRight = '8px';
      drawBlockIcon(canvas, iconBlockId, this.atlas);
      el.appendChild(canvas);
    }
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  setDamageFlash(on) {
    document.getElementById('damage-vignette').classList.toggle('hit', on);
  }

  setWaterOverlay(on) {
    document.getElementById('water-overlay').classList.toggle('on', on);
  }

  setMiningProgress(value) {
    const wrap = document.getElementById('mining-progress');
    const bar = document.getElementById('mining-bar');
    if (value <= 0) {
      wrap.classList.remove('on');
      bar.style.width = '0%';
    } else {
      wrap.classList.add('on');
      bar.style.width = `${Math.min(100, value * 100)}%`;
    }
  }

  // ---------- Инвентарь ----------
  renderInventory() {
    const inv = this.inventory;
    const main = document.getElementById('inv-main');
    const hot = document.getElementById('inv-hotbar');
    main.innerHTML = '';
    hot.innerHTML = '';

    const makeSlot = (index, el) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (index === inv.selected && index < 9 ? ' active' : '');
      const canvas = document.createElement('canvas');
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      slot.appendChild(canvas);
      const item = inv.slots[index];
      if (item) {
        drawBlockIcon(canvas, item.id, this.atlas);
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = item.count > 1 && !inv.creative ? String(item.count) : '';
        slot.appendChild(count);
      }
      slot.addEventListener('click', () => this.onInventorySlotClick?.(index));
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onInventorySlotRightClick?.(index);
      });
      el.appendChild(slot);
    };

    for (let i = 9; i < 36; i++) makeSlot(i, main);
    for (let i = 0; i < 9; i++) makeSlot(i, hot);
  }

  renderRecipes() {
    const inv = this.inventory;
    const list = document.getElementById('recipe-list');
    list.innerHTML = '';
    for (const recipe of RECIPES) {
      const can = inv.canCraft(recipe);
      const el = document.createElement('div');
      el.className = 'recipe' + (can ? '' : ' disabled');
      const canvas = document.createElement('canvas');
      canvas.className = 'r-ico';
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      drawBlockIcon(canvas, blockByName(recipe.out.name), this.atlas);
      const name = document.createElement('div');
      name.className = 'r-name';
      name.textContent = `${recipe.label} ×${recipe.out.count}`;
      const cost = document.createElement('div');
      cost.className = 'r-cost';
      cost.textContent = recipe.in
        .map((ing) => `${getBlock(blockByName(ing.name)).label} ${inv.count(ing.name)}/${ing.count}`)
        .join('<br>');
      cost.innerHTML = cost.textContent.replace(/&lt;br&gt;/g, '<br>');
      // заменяем разделитель на переносы
      cost.innerHTML = recipe.in
        .map((ing) => `${getBlock(blockByName(ing.name)).label} ${inv.count(ing.name)}/${ing.count}`)
        .join('<br>');
      el.appendChild(canvas);
      el.appendChild(name);
      el.appendChild(cost);
      el.addEventListener('click', () => {
        if (!can) return;
        this.onCraft?.(recipe);
      });
      list.appendChild(el);
    }

    const mats = document.getElementById('materials');
    mats.innerHTML = '';
    const used = new Map();
    for (const slot of inv.slots) {
      if (!slot) continue;
      used.set(slot.name, (used.get(slot.name) || 0) + slot.count);
    }
    if (used.size === 0) {
      mats.innerHTML = '<div class="mat">Инвентарь пуст</div>';
    }
    for (const [name, count] of used) {
      const el = document.createElement('div');
      el.className = 'mat';
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      drawBlockIcon(canvas, blockByName(name), this.atlas);
      el.appendChild(canvas);
      const span = document.createElement('span');
      span.textContent = `${getBlock(blockByName(name)).label} ×${count}`;
      el.appendChild(span);
      mats.appendChild(el);
    }
  }

  renderCreative() {
    const grid = document.getElementById('creative-grid');
    grid.innerHTML = '';
    for (const cat of CREATIVE_CATEGORIES) {
      for (const name of cat.blocks) {
        const id = blockByName(name);
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.title = getBlock(id).label;
        const canvas = document.createElement('canvas');
        canvas.width = ICON_SIZE;
        canvas.height = ICON_SIZE;
        drawBlockIcon(canvas, id, this.atlas);
        slot.appendChild(canvas);
        slot.addEventListener('click', () => this.onCreativePick?.(name));
        grid.appendChild(slot);
      }
    }
  }

  showScreen(id) {
    for (const screen of document.querySelectorAll('.screen')) {
      if (screen.id !== id) screen.classList.add('hidden');
    }
    if (id) document.getElementById(id)?.classList.remove('hidden');
  }

  hideAllScreens() {
    for (const screen of document.querySelectorAll('.screen')) screen.classList.add('hidden');
  }
}

export { ICON_SIZE, STACK_SIZE };
