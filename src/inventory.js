import { getBlock, ID, blockByName, CREATIVE_CATEGORIES } from './blocks.js';

export const STACK_SIZE = 64;

export const RECIPES = [
  { id: 'planks', out: { name: 'planks', count: 4 }, in: [{ name: 'log', count: 1 }], label: 'Доски' },
  { id: 'planks2', out: { name: 'planks', count: 6 }, in: [{ name: 'planks', count: 2 }], label: 'Доски (×6 из 2)' },
  { id: 'cobble_from_gravel', out: { name: 'cobblestone', count: 2 }, in: [{ name: 'gravel', count: 2 }], label: 'Булыжник' },
  { id: 'stone_from_cobble', out: { name: 'stone', count: 1 }, in: [{ name: 'cobblestone', count: 1 }], label: 'Камень' },
  { id: 'sandstone', out: { name: 'sandstone', count: 1 }, in: [{ name: 'sand', count: 4 }], label: 'Песчаник' },
  { id: 'glass', out: { name: 'glass', count: 1 }, in: [{ name: 'sand', count: 3 }], label: 'Стекло' },
  { id: 'bricks', out: { name: 'bricks', count: 1 }, in: [{ name: 'dirt', count: 4 }], label: 'Кирпич' },
  { id: 'glowstone', out: { name: 'glowstone', count: 1 }, in: [{ name: 'diamond_ore', count: 1 }, { name: 'sand', count: 3 }], label: 'Светокамень' },
  { id: 'tnt', out: { name: 'tnt', count: 1 }, in: [{ name: 'sand', count: 4 }, { name: 'coal_ore', count: 2 }], label: 'ТНТ' },
  { id: 'snow_block', out: { name: 'snow_block', count: 1 }, in: [{ name: 'ice', count: 2 }], label: 'Снег' },
  { id: 'wool_white', out: { name: 'wool_white', count: 1 }, in: [{ name: 'tall_grass', count: 4 }], label: 'Белая шерсть' },
  { id: 'wool_red', out: { name: 'wool_red', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'flower_red', count: 1 }], label: 'Красная шерсть' },
  { id: 'wool_yellow', out: { name: 'wool_yellow', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'flower_yellow', count: 1 }], label: 'Жёлтая шерсть' },
  { id: 'wool_lime', out: { name: 'wool_lime', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'leaves', count: 2 }], label: 'Салатовая шерсть' },
  { id: 'wool_black', out: { name: 'wool_black', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'coal_ore', count: 1 }], label: 'Чёрная шерсть' },
  { id: 'wool_orange', out: { name: 'wool_orange', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'flower_red', count: 1 }, { name: 'flower_yellow', count: 1 }], label: 'Оранжевая шерсть' },
  { id: 'wool_blue', out: { name: 'wool_blue', count: 1 }, in: [{ name: 'wool_white', count: 1 }, { name: 'diamond_ore', count: 1 }], label: 'Синяя шерсть' },
  { id: 'wool_purple', out: { name: 'wool_purple', count: 1 }, in: [{ name: 'wool_red', count: 1 }, { name: 'wool_blue', count: 1 }], label: 'Фиолетовая шерсть' },
];

export class Inventory {
  constructor() {
    // 9 слотов хотбара + 27 слотов основного
    this.slots = new Array(36).fill(null);
    this.selected = 0;
    this.creative = false;
    this.cursor = null;
  }

  get hotbar() {
    return this.slots.slice(0, 9);
  }

  get selectedItem() {
    return this.slots[this.selected];
  }

  get selectedBlockId() {
    const item = this.slots[this.selected];
    if (!item) return 0;
    return item.id;
  }

  /** Добавляет предметы, возвращает остаток, который не поместился */
  add(name, count = 1) {
    const id = blockByName(name);
    if (!id) return count;

    if (this.creative) {
      // в креативе просто занимаем слот
      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i] && this.slots[i].id === id) return 0;
      }
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.slots[i]) {
          this.slots[i] = { id, name, count };
          return 0;
        }
      }
      return 0;
    }

    let remaining = count;
    // докладываем в существующие стеки
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id && slot.count < STACK_SIZE) {
        const add = Math.min(STACK_SIZE - slot.count, remaining);
        slot.count += add;
        remaining -= add;
      }
    }
    // новые слоты, сначала хотбар
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(STACK_SIZE, remaining);
        this.slots[i] = { id, name, count: add };
        remaining -= add;
      }
    }
    return remaining;
  }

  count(name) {
    const id = blockByName(name);
    return this.slots.reduce((acc, s) => acc + (s && s.id === id ? s.count : 0), 0);
  }

  remove(name, count = 1) {
    const id = blockByName(name);
    let remaining = count;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) this.slots[i] = null;
      }
    }
    return remaining === 0;
  }

  consumeSelected(count = 1) {
    const slot = this.slots[this.selected];
    if (!slot) return false;
    if (this.creative) return true;
    slot.count -= count;
    if (slot.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  canCraft(recipe) {
    if (this.creative) return true;
    return recipe.in.every((ing) => this.count(ing.name) >= ing.count);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    if (!this.creative) {
      for (const ing of recipe.in) this.remove(ing.name, ing.count);
      this.add(recipe.out.name, recipe.out.count);
    } else {
      this.add(recipe.out.name, recipe.out.count);
    }
    return true;
  }

  toJSON() {
    return {
      slots: this.slots.map((s) => (s ? [s.name, s.count] : null)),
      selected: this.selected,
    };
  }

  loadJSON(data) {
    if (!data) return;
    this.slots = new Array(36).fill(null);
    (data.slots || []).forEach((s, i) => {
      if (s && blockByName(s[0])) {
        this.slots[i] = { id: blockByName(s[0]), name: s[0], count: s[1] };
      }
    });
    this.selected = data.selected || 0;
  }

  fillStarter() {
    this.add('grass', 64);
    this.add('dirt', 64);
    this.add('stone', 64);
    this.add('planks', 64);
    this.add('log', 32);
    this.add('glass', 32);
    this.add('glowstone', 16);
    this.add('torch', 32);
    this.add('tnt', 8);
  }

  fillCreative() {
    this.slots = new Array(36).fill(null);
    let i = 0;
    for (const cat of CREATIVE_CATEGORIES) {
      for (const name of cat.blocks) {
        if (i >= 36) break;
        const id = blockByName(name);
        if (id) this.slots[i++] = { id, name, count: 64 };
      }
    }
  }

  clear() {
    this.slots = new Array(36).fill(null);
    this.selected = 0;
  }
}

export function itemLabel(item) {
  if (!item) return '';
  const def = getBlock(item.id);
  return def.label || item.name;
}

export { ID, blockByName };
