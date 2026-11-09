// Реестр блоков: id, текстуры по граням, физические свойства.

export const AIR = 0;

/** Порядок важен: id блока = индекс в массиве (нужен для сохранений). */
const DEFS = [
  { name: 'grass', label: 'Трава', top: 'grass_top', side: 'grass_side', bottom: 'dirt', hardness: 0.6, drops: 'dirt' },
  { name: 'dirt', label: 'Земля', all: 'dirt', hardness: 0.5 },
  { name: 'stone', label: 'Камень', all: 'stone', hardness: 1.5, drops: 'cobblestone' },
  { name: 'cobblestone', label: 'Булыжник', all: 'cobblestone', hardness: 1.5 },
  { name: 'bedrock', label: 'Бедрок', all: 'bedrock', hardness: Infinity },
  { name: 'sand', label: 'Песок', all: 'sand', hardness: 0.5 },
  { name: 'sandstone', label: 'Песчаник', top: 'sand', side: 'sandstone_side', bottom: 'sand', hardness: 0.8 },
  { name: 'water', label: 'Вода', all: 'water', liquid: true, opaque: false, solid: false, hardness: Infinity },
  { name: 'log', label: 'Древесина', top: 'log_top', side: 'log_side', bottom: 'log_top', hardness: 1.0 },
  { name: 'leaves', label: 'Листва', all: 'leaves', opaque: false, cutout: true, hardness: 0.25 },
  { name: 'planks', label: 'Доски', all: 'planks', hardness: 0.8 },
  { name: 'glass', label: 'Стекло', all: 'glass', opaque: false, transparent: true, hardness: 0.3, drops: null },
  { name: 'snow_block', label: 'Снег', top: 'snow', side: 'snow_side', bottom: 'snow', hardness: 0.4 },
  { name: 'ice', label: 'Лёд', all: 'ice', opaque: false, transparent: true, hardness: 0.5, drops: null },
  { name: 'bricks', label: 'Кирпич', all: 'bricks', hardness: 1.6 },
  { name: 'tnt', label: 'ТНТ', top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom', hardness: 0.3, tnt: true },
  { name: 'glowstone', label: 'Светокамень', all: 'glowstone', hardness: 0.4, light: 15 },
  { name: 'coal_ore', label: 'Уголь', all: 'coal_ore', hardness: 2.0 },
  { name: 'iron_ore', label: 'Железо', all: 'iron_ore', hardness: 2.4 },
  { name: 'gold_ore', label: 'Золото', all: 'gold_ore', hardness: 2.6 },
  { name: 'diamond_ore', label: 'Алмаз', all: 'diamond_ore', hardness: 3.0 },
  { name: 'gravel', label: 'Гравий', all: 'gravel', hardness: 0.6 },
  { name: 'wool_white', label: 'Шерсть', all: 'wool_white', hardness: 0.4 },
  { name: 'wool_red', label: 'Красная шерсть', all: 'wool_red', hardness: 0.4 },
  { name: 'wool_orange', label: 'Оранж. шерсть', all: 'wool_orange', hardness: 0.4 },
  { name: 'wool_yellow', label: 'Жёлтая шерсть', all: 'wool_yellow', hardness: 0.4 },
  { name: 'wool_lime', label: 'Салатовая шерсть', all: 'wool_lime', hardness: 0.4 },
  { name: 'wool_blue', label: 'Синяя шерсть', all: 'wool_blue', hardness: 0.4 },
  { name: 'wool_purple', label: 'Фиолет. шерсть', all: 'wool_purple', hardness: 0.4 },
  { name: 'wool_black', label: 'Чёрная шерсть', all: 'wool_black', hardness: 0.4 },
  { name: 'torch', label: 'Факел', all: 'torch', cross: true, solid: false, opaque: false, cutout: true, hardness: 0.05, drops: null, light: 14 },
  { name: 'tall_grass', label: 'Трава (растение)', all: 'tall_grass', cross: true, solid: false, opaque: false, cutout: true, hardness: 0.05, drops: null },
  { name: 'flower_red', label: 'Мак', all: 'flower_red', cross: true, solid: false, opaque: false, cutout: true, hardness: 0.05, drops: null },
  { name: 'flower_yellow', label: 'Одуванчик', all: 'flower_yellow', cross: true, solid: false, opaque: false, cutout: true, hardness: 0.05, drops: null },
  { name: 'cactus', label: 'Кактус', top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top', hardness: 0.5, opaque: false },
];

export const BLOCKS = [
  {
    id: 0, name: 'air', label: 'Воздух', solid: false, opaque: false, liquid: false,
    hardness: 0, faces: null,
  },
];

const byName = new Map([['air', 0]]);

DEFS.forEach((def, i) => {
  const id = i + 1;
  const all = def.all;
  const faces = [
    def.side || all, // +x
    def.side || all, // -x
    def.top || all, // +y
    def.bottom || all, // -y
    def.side || all, // +z
    def.side || all, // -z
  ];
  const block = {
    id,
    name: def.name,
    label: def.label,
    faces,
    topTexture: def.top || all,
    solid: def.solid !== false,
    opaque: def.opaque !== false,
    liquid: !!def.liquid,
    transparent: !!def.transparent,
    cutout: !!def.cutout,
    cross: !!def.cross,
    hardness: def.hardness ?? 1,
    light: def.light || 0,
    drops: def.drops === undefined ? def.name : def.drops,
    tnt: !!def.tnt,
  };
  if (def.cross) block.faces = [all, all, all, all, all, all];
  BLOCKS.push(block);
  byName.set(def.name, id);
});

export const ID = {};
for (const b of BLOCKS) if (b.name !== 'air') ID[b.name] = b.id;

export const blockByName = (name) => byName.get(name) ?? 0;
export const getBlock = (id) => BLOCKS[id] || BLOCKS[0];

/** Все блоки, которые игрок может поставить (для инвентаря) */
export function placeableBlocks() {
  return BLOCKS.filter((b) => b.id !== 0 && !b.liquid && b.name !== 'bedrock');
}

/** Блоки, доступные в креативном инвентаре, по категориям */
export const CREATIVE_CATEGORIES = [
  {
    name: 'Природа',
    blocks: ['grass', 'dirt', 'stone', 'sand', 'sandstone', 'gravel', 'log', 'leaves', 'snow_block', 'ice', 'cactus', 'tall_grass', 'flower_red', 'flower_yellow', 'torch'],
  },
  {
    name: 'Строительство',
    blocks: ['cobblestone', 'planks', 'bricks', 'glass', 'glowstone', 'torch', 'tnt'],
  },
  {
    name: 'Руды',
    blocks: ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore'],
  },
  {
    name: 'Шерсть',
    blocks: ['wool_white', 'wool_red', 'wool_orange', 'wool_yellow', 'wool_lime', 'wool_blue', 'wool_purple', 'wool_black'],
  },
];
