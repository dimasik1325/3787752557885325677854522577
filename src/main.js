import * as THREE from 'three';
import {
  CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, DEFAULT_RENDER_DISTANCE,
  MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, REACH_DISTANCE, DAY_LENGTH,
  START_TIME, SAVE_KEY, SETTINGS_KEY, PLAYER_HEIGHT,
} from './config.js';
import { World, chunkKey } from './world.js';
import { GameRenderer } from './renderer.js';
import { Player, findSpawn } from './player.js';
import { Inventory } from './inventory.js';
import { UI, ICON_SIZE } from './ui.js';
import { AudioEngine, soundMaterialFor } from './audio.js';
import { MobManager, buildHumanoid, MOB_TYPES } from './mobs.js';
import { AIR, ID, getBlock, blockByName } from './blocks.js';
import { clamp } from './utils.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new GameRenderer(this.canvas);
    this.atlas = this.renderer.atlas;

    this.world = new World(1337);
    this.inventory = new Inventory();
    this.ui = new UI(this.atlas, this.inventory);
    this.audio = new AudioEngine();
    this.player = new Player(this.world);

    this.settings = this.loadSettings();
    this.renderDistance = this.settings.renderDistance;
    this.renderer.setRenderDistance(this.renderDistance);

    this.timeOfDay = START_TIME;
    this.paused = true;
    this.running = false;
    this.showDebug = this.settings.showDebug;
    this.mode = 'survival';

    this.keys = {};
    this.mouse = { left: false, right: false };
    this.lastFrame = performance.now();
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.fps = 60;
    this.mouseSensitivity = this.settings.sensitivity;

    // Интерактивные состояния
    this.mining = null;
    this.targetHit = null;
    this.fallbackLook = false;
    this.lastMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.lockRequestedAt = 0;
    this.tntList = [];
    this.gravityQueue = [];
    this.droppedItems = [];
    this.sprintToggle = false;
    this.lastSpaceTap = 0;

    this.chunkQueue = [];
    this.lastChunkPos = { cx: null, cz: null };
    this.chunkUnloadTimer = 0;

    this.mobs = null;
    this.playerModel = null;

    this.initSceneLights();
    this.bindEvents();
    this.buildOffsetList();
    this.ui.renderCreative();
    this.applySettingsToUI();
    this.setupSaveDetection();

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initSceneLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.renderer.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xfff2d0, 1.3);
    this.sunLight.position.set(60, 120, 40);
    this.renderer.scene.add(this.sunLight);
  }

  // ---------- Настройки ----------
  loadSettings() {
    const defaults = {
      renderDistance: DEFAULT_RENDER_DISTANCE,
      sensitivity: 1,
      fov: 72,
      volume: 55,
      showDebug: false,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch (e) {
      /* ignore */
    }
    return defaults;
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      /* ignore */
    }
  }

  applySettingsToUI() {
    document.getElementById('rd-value').textContent = this.settings.renderDistance;
    document.getElementById('rd-input').value = this.settings.renderDistance;
    document.getElementById('sens-value').textContent = this.settings.sensitivity.toFixed(1);
    document.getElementById('sens-input').value = this.settings.sensitivity;
    document.getElementById('fov-value').textContent = this.settings.fov;
    document.getElementById('fov-input').value = this.settings.fov;
    document.getElementById('vol-value').textContent = this.settings.volume;
    document.getElementById('vol-input').value = this.settings.volume;
    document.getElementById('debug-input').checked = this.settings.showDebug;
    this.renderer.camera.fov = this.settings.fov;
    this.renderer.camera.updateProjectionMatrix();
    this.audio.setVolume(this.settings.volume / 100);
  }

  setupSaveDetection() {
    const btn = document.getElementById('continue-btn');
    const save = this.loadSaveData();
    if (save) {
      btn.classList.remove('hidden');
      const date = save.savedAt ? new Date(save.savedAt).toLocaleString('ru-RU') : '';
      btn.textContent = `Продолжить (${date})`;
    }
  }

  loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // ---------- Запуск ----------
  newGame(seedText, mode) {
    let seed = 1337;
    if (seedText) {
      const num = parseInt(seedText, 10);
      seed = Number.isFinite(num) && String(num) === seedText.trim() ? num : this.hashString(seedText);
    }
    this.startGame({ seed, mode, save: null });
  }

  continueGame() {
    const save = this.loadSaveData();
    if (!save) return;
    this.startGame({ seed: save.seed, mode: save.mode || 'survival', save });
  }

  hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return h;
  }

  async startGame({ seed, mode, save }) {
    this.ui.showScreen('loading-screen');
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-text');
    bar.style.width = '4%';

    this.mode = mode;
    this.inventory.creative = mode === 'creative';

    // Чистим меши предыдущего мира
    for (const [key, group] of [...this.renderer.chunkObjects]) {
      const chunk = this.world.chunks.get(key);
      this.renderer.disposeChunkObject(group, chunk);
      this.renderer.chunkObjects.delete(key);
    }

    // Пересоздаём мир
    this.world = new World(seed);
    this.world.onBlockChange((x, y, z) => {
      const chunk = this.world.getChunk(x >> 4, z >> 4);
      if (chunk) chunk.dirty = true;
    });
    this.player.world = this.world;
    this.player.viewMode = 0;
    this.player.flying = mode === 'creative';
    this.player.health = 20;

    if (save) {
      this.world.loadModifications(save.modifications || []);
      this.timeOfDay = save.timeOfDay ?? START_TIME;
    } else {
      this.timeOfDay = START_TIME;
      this.world.modifications.clear();
    }

    // Начальная генерация вокруг спавна
    let spawnX = 0;
    let spawnZ = 0;
    if (save && save.player) {
      spawnX = Math.floor(save.player.x);
      spawnZ = Math.floor(save.player.z);
    }

    const radius = 3;
    let done = 0;
    const total = (radius * 2 + 1) * (radius * 2 + 1);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.world.generateChunk(spawnX + dx, spawnZ + dz);
        done++;
        bar.style.width = `${4 + (done / total) * 84}%`;
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
    text.textContent = 'Строим меши и расставляем блоки…';

    if (save && save.player) {
      this.player.setPosition(save.player.x, save.player.y, save.player.z);
      this.player.yaw = save.player.yaw || 0;
      this.player.pitch = save.player.pitch || 0;
      this.player.health = save.player.health ?? 20;
      this.player.flying = save.player.flying ?? (mode === 'creative');
    } else {
      const spawn = findSpawn(this.world, spawnX, spawnZ);
      this.player.setPosition(spawn.x, spawn.y, spawn.z);
      this.player.yaw = Math.PI * 0.25;
      this.player.pitch = -0.12;
    }
    this.player.fallStartY = this.player.position.y;

    // Чанки для отрисовки
    this.rebuildNearbyMeshes();

    // Инвентарь
    this.inventory.clear();
    if (mode === 'creative') {
      this.inventory.fillCreative();
    } else {
      if (save && save.inventory) this.inventory.loadJSON(save.inventory);
      else this.inventory.fillStarter();
    }
    this.inventory.creative = mode === 'creative';
    this.ui.refreshHotbar();
    this.ui.renderInventory();
    this.ui.renderRecipes();
    this.updateHeldItem();

    // Мобы
    if (this.mobs) this.mobs.clear();
    this.mobs = new MobManager(this.world, this.renderer.scene);
    this.mobs.onPlayerAttacked = (mob) => {
      this.audio.mobHurt();
    };
    this.mobs.onMobDeath = (mob) => {
      if (this.mode !== 'survival') return;
      for (const [name, count] of mob.drops || mob.def.drops || []) {
        this.inventory.add(name, count);
        this.ui.toast(`+${getBlock(blockByName(name)).label} ×${count}`, blockByName(name));
      }
      this.ui.refreshHotbar();
    };
    // Немного стартовых мобов
    for (let i = 0; i < 6; i++) {
      this.mobs.trySpawn(this.player, false);
    }

    // Модель игрока для 3-го лица
    this.ensurePlayerModel();

    this.deathHandled = false;
    this.gravityQueue = [];
    this.tntList = [];
    for (const drop of this.droppedItems) this.disposeDrop(drop);
    this.droppedItems = [];
    this.targetHit = null;
    this.mining = null;
    this.keys = {};
    this.mouse.left = false;
    this.mouse.right = false;

    bar.style.width = '100%';
    await new Promise((r) => setTimeout(r, 120));

    this.ui.hideAllScreens();
    document.getElementById('hud').classList.remove('hidden');
    this.ui.setDebug({ visible: this.showDebug });
    this.paused = false;
    this.running = true;
    this.lastFrame = performance.now();

    this.audio.ensure();
    this.audio.startAmbient();
    this.requestPointerLock();

    this.ui.updateVitals(this.player);
    this.ui.toast(
      mode === 'creative' ? 'Режим креатива: блоки бесконечны, F — полёт' : 'Выживание: добывайте блоки и крафтите',
    );
  }

  ensurePlayerModel() {
    if (this.playerModel) return;
    const built = buildHumanoid({});
    this.playerModel = built;
    this.playerModel.group.visible = false;
    this.renderer.scene.add(this.playerModel.group);
  }

  // ---------- Сохранение ----------
  saveGame(showToast = true) {
    if (!this.running) return false;
    const data = {
      version: 1,
      seed: this.world.seed,
      mode: this.mode,
      timeOfDay: this.timeOfDay,
      savedAt: Date.now(),
      player: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        flying: this.player.flying,
      },
      inventory: this.inventory.toJSON(),
      modifications: this.world.serializeModifications(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (showToast) this.ui.toast('Мир сохранён');
      this.setupSaveDetection();
      return true;
    } catch (e) {
      this.ui.toast('Не удалось сохранить: ' + e.message);
      return false;
    }
  }

  deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Ввод ----------
  bindEvents() {
    // Меню
    document.querySelectorAll('#mode-select button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-select button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMode = btn.dataset.mode;
      });
    });
    this.selectedMode = 'survival';
    document.getElementById('start-btn').addEventListener('click', () => {
      this.audio.ensure();
      const seed = document.getElementById('seed-input').value;
      this.newGame(seed, this.selectedMode);
    });
    document.getElementById('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('start-btn').click();
    });
    document.getElementById('continue-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.continueGame();
    });
    document.getElementById('resume-btn').addEventListener('click', () => this.resume());
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.ui.showScreen('settings-screen');
    });
    document.getElementById('save-btn').addEventListener('click', () => this.saveGame());
    document.getElementById('new-world-btn').addEventListener('click', () => {
      this.pause(true);
      this.deleteSave();
      document.getElementById('continue-btn').classList.add('hidden');
      this.ui.showScreen('start-screen');
      document.getElementById('hud').classList.add('hidden');
      this.running = false;
    });
    document.getElementById('settings-back').addEventListener('click', () => {
      if (this.running) this.ui.showScreen('pause-screen');
      else this.ui.showScreen('start-screen');
      this.saveSettings();
    });
    document.getElementById('respawn-btn').addEventListener('click', () => {
      this.deathHandled = false;
      this.player.respawn(this.world);
      this.player.health = 20;
      this.player.breath = this.player.maxBreath;
      this.ui.setDamageFlash(false);
      this.ui.showScreen(null);
      document.getElementById('hud').classList.remove('hidden');
      this.paused = false;
      this.requestPointerLock();
    });
    document.getElementById('inv-close').addEventListener('click', () => this.closeInventory());

    // Настройки
    const rd = document.getElementById('rd-input');
    rd.addEventListener('input', () => {
      this.settings.renderDistance = +rd.value;
      document.getElementById('rd-value').textContent = rd.value;
      this.renderDistance = +rd.value;
      this.renderer.setRenderDistance(this.renderDistance);
      this.buildOffsetList();
      this.saveSettings();
    });
    const sens = document.getElementById('sens-input');
    sens.addEventListener('input', () => {
      this.settings.sensitivity = +sens.value;
      document.getElementById('sens-value').textContent = (+sens.value).toFixed(1);
      this.mouseSensitivity = +sens.value;
      this.saveSettings();
    });
    const fov = document.getElementById('fov-input');
    fov.addEventListener('input', () => {
      this.settings.fov = +fov.value;
      document.getElementById('fov-value').textContent = fov.value;
      this.renderer.camera.fov = +fov.value;
      this.renderer.camera.updateProjectionMatrix();
      this.saveSettings();
    });
    const vol = document.getElementById('vol-input');
    vol.addEventListener('input', () => {
      this.settings.volume = +vol.value;
      document.getElementById('vol-value').textContent = vol.value;
      this.audio.setVolume(+vol.value / 100);
      this.saveSettings();
    });
    const dbg = document.getElementById('debug-input');
    dbg.addEventListener('change', () => {
      this.showDebug = dbg.checked;
      this.settings.showDebug = dbg.checked;
      this.saveSettings();
    });

    // Инвентарь: вкладки
    document.querySelectorAll('.inv-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.inv-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        for (const pane of document.querySelectorAll('.inv-pane')) pane.classList.add('hidden');
        document.getElementById(`inv-tab-${tab.dataset.tab}`).classList.remove('hidden');
        if (tab.dataset.tab === 'craft') this.ui.renderRecipes();
        if (tab.dataset.tab === 'creative') this.ui.renderCreative();
        this.audio.uiClick();
      });
    });

    // UI коллбеки
    this.ui.onSlotClick = (index) => {
      this.ui.setSelected(index);
      this.audio.uiClick();
    };
    this.ui.onSelectionChange = () => this.updateHeldItem();
    this.ui.onInventorySlotClick = (index) => this.handleInvSlotClick(index, false);
    this.ui.onInventorySlotRightClick = (index) => this.handleInvSlotClick(index, true);
    this.ui.onCraft = (recipe) => {
      if (this.inventory.craft(recipe)) {
        this.audio.craft();
        this.ui.renderInventory();
        this.ui.renderRecipes();
        this.ui.refreshHotbar();
        this.ui.toast(`Скрафчено: ${getBlock(blockByName(recipe.out.name)).label} ×${recipe.out.count}`, blockByName(recipe.out.name));
      }
    };
    this.ui.onCreativePick = (name) => {
      const id = blockByName(name);
      this.inventory.slots[this.inventory.selected] = { id, name, count: 64 };
      this.ui.refreshHotbar();
      this.ui.renderInventory();
      this.updateHeldItem();
      this.audio.uiClick();
    };

    // Клавиатура
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouse.left = false;
      this.mouse.right = false;
    });

    // Мышь
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isPointerLocked() && !this.fallbackLook) return;
        e.preventDefault();
        const dir = Math.sign(e.deltaY);
        this.ui.setSelected(this.inventory.selected + dir);
        this.audio.uiClick();
      },
      { passive: false }
    );

    document.addEventListener('pointerlockchange', () => {
      if (!this.isPointerLocked() && this.running && !this.inventoryOpen && !this.player.dead && !this.fallbackLook) {
        this.pause();
      }
    });

    document.addEventListener('pointerlockerror', () => this.enableFallbackLook());

    // Если захват мыши недоступен (например, игра встроена в iframe) — включаем резервное управление
    this.fallbackCheck = setInterval(() => {
      if (!this.running || this.paused) return;
      if (this.lockRequestedAt && !this.isPointerLocked() && performance.now() - this.lockRequestedAt > 900) {
        this.enableFallbackLook();
      }
    }, 700);

    // Резервное наведение мышью: позиция курсора задаёт направление поворота
    this.canvas.addEventListener('mousemove', (e) => {
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    });

    window.addEventListener('beforeunload', () => {
      if (this.running) this.saveGame(false);
    });
  }

  handleInvSlotClick(index, rightClick) {
    const inv = this.inventory;
    if (inv.creative) {
      // в креативе: ПКМ — очистить, ЛКМ — выбрать в хотбар
      if (rightClick) {
        inv.slots[index] = null;
      } else {
        const item = inv.slots[index];
        if (item) {
          if (index >= 9) {
            const target = inv.selected;
            const tmp = inv.slots[target];
            inv.slots[target] = item;
            inv.slots[index] = tmp;
          } else {
            inv.selected = index;
          }
        }
      }
    } else {
      const cursor = inv.cursor;
      const slot = inv.slots[index];
      if (!cursor && slot) {
        if (rightClick && slot.count > 1) {
          const half = Math.ceil(slot.count / 2);
          inv.cursor = { id: slot.id, name: slot.name, count: half };
          slot.count -= half;
          if (slot.count <= 0) inv.slots[index] = null;
        } else {
          inv.cursor = slot;
          inv.slots[index] = null;
        }
      } else if (cursor && !slot) {
        if (rightClick) {
          inv.slots[index] = { ...cursor, count: 1 };
          cursor.count--;
          if (cursor.count <= 0) inv.cursor = null;
        } else {
          inv.slots[index] = cursor;
          inv.cursor = null;
        }
      } else if (cursor && slot) {
        if (cursor.id === slot.id) {
          const space = 64 - slot.count;
          const move = rightClick ? Math.min(1, space) : Math.min(space, cursor.count);
          slot.count += move;
          cursor.count -= move;
          if (cursor.count <= 0) inv.cursor = null;
        } else {
          inv.slots[index] = cursor;
          inv.cursor = slot;
        }
      }
    }
    this.ui.renderInventory();
    this.ui.refreshHotbar();
    this.updateHeldItem();
    this.audio.uiClick();
  }

  onKeyDown(e) {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
      e.preventDefault();
    }

    // На стартовом экране не перехватываем ввод в поле
    if (!this.running) return;

    if (code === 'Escape') {
      if (this.inventoryOpen) {
        this.closeInventory();
      } else if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
      return;
    }

    if (code === 'KeyE') {
      if (this.inventoryOpen) this.closeInventory();
      else this.openInventory();
      return;
    }

    if (this.paused || this.inventoryOpen) {
      if (code === 'F3') {
        e.preventDefault();
        this.showDebug = !this.showDebug;
        this.settings.showDebug = this.showDebug;
        document.getElementById('debug-input').checked = this.showDebug;
        this.saveSettings();
      }
      return;
    }

    this.keys[code] = true;

    if (code.startsWith('Digit')) {
      const n = parseInt(code.slice(5), 10);
      if (n >= 1 && n <= 9) this.ui.setSelected(n - 1);
      return;
    }

    if (code === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
      this.settings.showDebug = this.showDebug;
      document.getElementById('debug-input').checked = this.showDebug;
      this.saveSettings();
      return;
    }

    if (code === 'F5') {
      e.preventDefault();
      this.player.viewMode = (this.player.viewMode + 1) % 2;
      return;
    }

    if (code === 'KeyF') {
      this.player.flying = !this.player.flying;
      this.player.velocity.y = 0;
      this.ui.toast(this.player.flying ? 'Полёт включён' : 'Полёт выключен');
      return;
    }

    if (code === 'KeyG') {
      // быстрая смена времени суток — приятная мелочь
      this.timeOfDay = (this.timeOfDay + 0.125) % 1;
      return;
    }

    if (code === 'KeyQ') {
      this.dropSelectedItem();
      return;
    }

    if (code === 'Space') {
      const now = performance.now();
      if (now - this.lastSpaceTap < 280) this.player.flying = !this.player.flying;
      this.lastSpaceTap = now;
    }

    if (code === 'ControlLeft' || code === 'ControlRight') {
      // в креативе Ctrl — быстрый полёт, в выживании — бег
      this.sprintToggle = true;
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.sprintToggle = false;
  }

  onMouseDown(e) {
    if (!this.running || this.paused || this.inventoryOpen) return;
    if (!this.isPointerLocked() && !this.fallbackLook) {
      this.requestPointerLock();
      return;
    }
    if (!this.isPointerLocked() && this.fallbackLook && !this.canvas.contains(e.target)) return;
    if (e.button === 0) {
      this.mouse.left = true;
      this.startMining();
    } else if (e.button === 2) {
      this.mouse.right = true;
      this.useItem();
    } else if (e.button === 1) {
      this.pickBlock();
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      this.mouse.left = false;
      this.stopMining();
    }
    if (e.button === 2) this.mouse.right = false;
  }

  onMouseMove(e) {
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
    if (!this.isPointerLocked()) return;
    const sens = this.mouseSensitivity * 0.0022;
    this.player.yaw -= e.movementX * sens;
    this.player.pitch -= e.movementY * sens;
    this.player.pitch = clamp(this.player.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    this.player.yaw = ((this.player.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  enableFallbackLook() {
    if (this.fallbackLook) return;
    this.fallbackLook = true;
    this.lockRequestedAt = 0;
    this.ui.toast('Захват мыши недоступен: наводитесь мышью (курсор у центра = медленнее)');
    document.getElementById('hint').textContent = 'ЛКМ — сломать · ПКМ — поставить · E — инвентарь · F — полёт · ESC — меню';
  }

  /** Поворот камеры «наведением» — работает без захвата мыши */
  updateFallbackLook(dt) {
    if (!this.fallbackLook || this.paused || this.inventoryOpen) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (this.lastMouse.x - cx) / Math.max(1, cx);
    const dy = (this.lastMouse.y - cy) / Math.max(1, cy);
    const dead = 0.06;
    const curve = (v) => {
      const a = Math.abs(v);
      if (a < dead) return 0;
      const t = (a - dead) / (1 - dead);
      return Math.sign(v) * Math.pow(Math.min(1, t), 1.7);
    };
    const speed = 3.1 * this.mouseSensitivity;
    this.player.yaw -= curve(dx) * speed * dt;
    this.player.pitch -= curve(dy) * speed * dt * 0.8;
    this.player.pitch = clamp(this.player.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  }

  isPointerLocked() {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock() {
    this.lockRequestedAt = performance.now();
    try {
      if (this.canvas.requestPointerLock) {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => this.enableFallbackLook());
      } else {
        this.enableFallbackLook();
      }
    } catch (err) {
      this.enableFallbackLook();
    }
  }

  // ---------- Пауза / инвентарь ----------
  pause(silent = false) {
    if (!this.running) return;
    this.paused = true;
    this.mouse.left = false;
    this.mouse.right = false;
    this.keys = {};
    if (!silent) {
      this.ui.showScreen('pause-screen');
      this.saveGame(false);
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    this.ui.hideAllScreens();
    document.getElementById('hud').classList.remove('hidden');
    this.paused = false;
    this.inventoryOpen = false;
    this.ui.showScreen(null);
    this.lastFrame = performance.now();
    this.requestPointerLock();
  }

  openInventory() {
    this.inventoryOpen = true;
    this.mouse.left = false;
    this.keys = {};
    this.ui.renderInventory();
    this.ui.renderRecipes();
    this.ui.showScreen('inventory-screen');
    this.ui.setMiningProgress(0);
    this.mining = null;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeInventory() {
    this.inventoryOpen = false;
    this.ui.hideAllScreens();
    document.getElementById('hud').classList.remove('hidden');
    // вернуть «курсорный» стак в инвентарь
    if (this.inventory.cursor) {
      const name = this.inventory.cursor.name;
      const count = this.inventory.cursor.count;
      this.inventory.cursor = null;
      this.inventory.add(name, count);
      this.ui.refreshHotbar();
    }
    this.requestPointerLock();
    this.ui.renderInventory();
  }

  // ---------- Взаимодействие ----------
  getHeadRay() {
    const origin = this.player.viewMode === 0
      ? this.player.eyePosition
      : this.renderer.camera.position.clone();
    const dir = this.player.direction;
    return { origin, dir };
  }

  updateTarget() {
    const { origin, dir } = this.getHeadRay();
    this.headOrigin = origin;
    this.headDir = dir;

    const blockHit = this.world.raycast(origin, dir, REACH_DISTANCE);
    let mobHit = null;
    if (this.mobs) {
      mobHit = this.mobs.raycastMob(origin, dir, REACH_DISTANCE);
      if (mobHit && blockHit && blockHit.distance < mobHit.distance) mobHit = null;
    }
    this.mobTarget = mobHit;
    this.targetHit = mobHit ? null : blockHit;
    this.renderer.setHighlight(this.targetHit, !this.player.dead);
    this.ui.setMiningProgress(0);
  }

  startMining() {
    const hit = this.targetHit;
    if (this.mobTarget) {
      this.attackMob(this.mobTarget.mob);
      this.renderer.swing();
      return;
    }
    if (!hit) return;
    const def = getBlock(hit.id);
    this.renderer.swing();
    if (this.mode === 'creative') {
      this.breakBlock(hit, true);
      return;
    }
    this.mining = { hit: { ...hit }, progress: 0, time: 0 };
  }

  stopMining() {
    this.mining = null;
    this.ui.setMiningProgress(0);
  }

  attackMob(mob) {
    if (mob.dead) return;
    const died = mob.damage(4);
    this.audio.mobHurt();
    if (died) {
      this.ui.toast(`Убит: ${mob.def.label}`);
      this.particlesBurst(mob.position, 0xd04040, 14);
    }
  }

  updateMining(dt) {
    if (!this.mouse.left) {
      this.stopMining();
      return;
    }
    if (!this.targetHit) return;
    if (!this.mining || this.mining.hit.x !== this.targetHit.x || this.mining.hit.y !== this.targetHit.y || this.mining.hit.z !== this.targetHit.z) {
      this.startMining();
      if (!this.mining) return;
    }
    const def = getBlock(this.mining.hit.id);
    const hardness = def.hardness === Infinity ? 999 : def.hardness;
    const breakTime = Math.max(0.08, hardness * 0.55);
    this.mining.time += dt;
    this.mining.progress = clamp(this.mining.time / breakTime, 0, 1);
    this.ui.setMiningProgress(this.mining.progress);
    if (this.mining.progress >= 1) {
      this.breakBlock(this.mining.hit, false);
      this.mining = null;
      this.ui.setMiningProgress(0);
      if (this.mouse.left) this.startMining();
    }
  }

  breakBlock(hit, instant) {
    if (!hit) return;
    const def = getBlock(hit.id);
    if (def.hardness === Infinity || def.name === 'bedrock') {
      this.ui.toast('Бедрок не сломать');
      return;
    }
    if (def.tnt) {
      this.igniteTNT(hit.x, hit.y, hit.z);
      return;
    }
    this.renderer.spawnBlockParticles(hit.x, hit.y, hit.z, hit.id, instant ? 10 : 16);
    this.audio.breakBlock(soundMaterialFor(def));
    this.world.setBlock(hit.x, hit.y, hit.z, AIR);

    if (this.mode === 'survival' && !instant) {
      const dropName = def.drops;
      if (dropName) {
        const dropId = blockByName(dropName);
        this.inventory.add(dropName, 1);
        this.ui.refreshHotbar();
        this.ui.toast(`+1 ${getBlock(dropId).label}`, dropId);
      }
    }

    // трава под растением исчезла — растение тоже падает
    const above = this.world.getBlock(hit.x, hit.y + 1, hit.z);
    const aboveDef = getBlock(above);
    if (aboveDef.cross) this.world.setBlock(hit.x, hit.y + 1, hit.z, AIR);

    this.afterBlockChange(hit.x, hit.y, hit.z);
  }

  useItem() {
    const item = this.inventory.selectedItem;
    const hit = this.targetHit;
    this.renderer.swing();
    if (!item) return;

    // Зажигание ТНТ
    if (hit) {
      const targetDef = getBlock(hit.id);
      if (targetDef.tnt) {
        this.igniteTNT(hit.x, hit.y, hit.z);
        return;
      }
    }

    if (!hit) return;
    const def = getBlock(item.id);
    if (!def || def.id === 0) return;

    const px = hit.x + hit.normal[0];
    const py = hit.y + hit.normal[1];
    const pz = hit.z + hit.normal[2];
    if (py < 0 || py >= WORLD_HEIGHT) return;
    const existing = this.world.getBlock(px, py, pz);
    if (existing !== AIR && !getBlock(existing).liquid) return;

    // Блок не должен оказаться внутри игрока — если так, выталкиваем игрока вверх
    let pushed = false;
    if (this.intersectsPlayer(px, py, pz)) {
      if (this.tryPushPlayerUp(px, py, pz)) pushed = true;
      else {
        this.ui.toast('Здесь стоите вы');
        return;
      }
    }
    void pushed;

    // Растения можно ставить только на землю
    if (def.cross) {
      const below = getBlock(this.world.getBlock(px, py - 1, pz));
      if (!below.solid || below.liquid) return;
    }

    this.world.setBlock(px, py, pz, item.id);
    this.audio.placeBlock(soundMaterialFor(def));
    if (!this.inventory.creative) {
      this.inventory.consumeSelected(1);
      this.ui.refreshHotbar();
      this.updateHeldItem();
    }
    this.afterBlockChange(px, py, pz);
  }

  /** Пытается «выдавить» игрока из блока вверх (как в Minecraft) */
  tryPushPlayerUp(x, y, z) {
    const p = this.player;
    for (let step = 1; step <= 2; step++) {
      const ny = p.position.y + step;
      if (!this.intersectsPlayerAt(x, y, z, p.position.x, ny, p.position.z) && !p.collides(p.position.x, ny, p.position.z)) {
        p.position.y = ny;
        p.fallStartY = ny;
        return true;
      }
    }
    return false;
  }

  intersectsPlayerAt(x, y, z, px, py, pz) {
    const half = 0.3;
    return (
      px + half > x && px - half < x + 1 &&
      py + PLAYER_HEIGHT > y && py < y + 1 &&
      pz + half > z && pz - half < z + 1
    );
  }

  intersectsPlayer(x, y, z) {
    const p = this.player.position;
    const half = 0.3;
    return (
      p.x + half > x && p.x - half < x + 1 &&
      p.y + PLAYER_HEIGHT > y && p.y < y + 1 &&
      p.z + half > z && p.z - half < z + 1
    );
  }

  pickBlock() {
    const hit = this.targetHit;
    if (!hit) return;
    const def = getBlock(hit.id);
    if (!def.id) return;
    const inv = this.inventory;
    // уже есть в хотбаре — просто выбираем
    for (let i = 0; i < 9; i++) {
      if (inv.slots[i] && inv.slots[i].id === def.id) {
        this.ui.setSelected(i);
        return;
      }
    }
    const idx = inv.slots.findIndex((s) => s && s.id === def.id);
    if (idx >= 0) {
      const tmp = inv.slots[idx];
      inv.slots[idx] = inv.slots[inv.selected];
      inv.slots[inv.selected] = tmp;
    } else if (this.mode === 'creative') {
      inv.slots[inv.selected] = { id: def.id, name: def.name, count: 64 };
    } else {
      this.ui.toast('Этого блока нет в инвентаре');
      return;
    }
    this.ui.refreshHotbar();
    this.updateHeldItem();
    this.audio.uiClick();
  }

  afterBlockChange(x, y, z) {
    // перестраиваем затронутые чанки
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.world.getChunk((x >> 4) + dx, (z >> 4) + dz);
        if (chunk) chunk.dirty = true;
      }
    }
    // песок и гравий падают, если под ними пусто
    for (let dy = 1; dy <= 12; dy++) {
      this.gravityQueue.push({ x, y: y + dy, z, delay: dy * 0.05 });
    }
  }

  /** Падающие блоки: песок и гравий */
  updateGravity(dt) {
    if (!this.gravityQueue.length) return;
    const still = [];
    for (const g of this.gravityQueue) {
      g.delay -= dt;
      if (g.delay > 0) {
        still.push(g);
        continue;
      }
      const id = this.world.getBlock(g.x, g.y, g.z);
      if (id !== ID.sand && id !== ID.gravel) continue;
      const below = this.world.getBlock(g.x, g.y - 1, g.z);
      const belowDef = getBlock(below);
      if (g.y > 0 && (below === AIR || belowDef.liquid || belowDef.cross)) {
        this.world.setBlock(g.x, g.y, g.z, AIR);
        this.world.setBlock(g.x, g.y - 1, g.z, id);
        this.renderer.spawnBlockParticles(g.x, g.y - 1, g.z, id, 2);
        // дальше следим за этим блоком
        still.push({ x: g.x, y: g.y - 1, z: g.z, delay: 0.06 });
        this.afterBlockChange(g.x, g.y - 1, g.z);
      }
    }
    this.gravityQueue = still.slice(0, 400);
  }

  updateHeldItem() {
    const item = this.inventory.selectedItem;
    this.renderer.setHeldBlock(item ? item.id : 0);
  }

  /** Выбросить один предмет из руки — появляется летящий блок, который можно подобрать */
  dropSelectedItem() {
    const item = this.inventory.selectedItem;
    if (!item) return;
    const canDrop = this.mode === 'survival';
    if (canDrop) {
      this.inventory.consumeSelected(1);
      this.ui.refreshHotbar();
      this.updateHeldItem();
    }
    const dir = this.player.direction;
    const eye = this.player.eyePosition;
    const geo = this.renderer.blockGeometry(getBlock(item.id));
    const mesh = new THREE.Mesh(geo, this.renderer.heldMaterial);
    mesh.scale.setScalar(0.3);
    mesh.position.copy(eye).addScaledVector(dir, 0.6);
    this.renderer.scene.add(mesh);
    this.droppedItems.push({
      mesh,
      name: item.name,
      id: item.id,
      velocity: new THREE.Vector3(dir.x * 5, dir.y * 5 + 2.2, dir.z * 5),
      age: 0,
      pickupDelay: 0.7,
    });
  }

  updateDroppedItems(dt) {
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const drop = this.droppedItems[i];
      drop.age += dt;
      drop.velocity.y -= 22 * dt;
      const pos = drop.mesh.position;
      const nx = pos.x + drop.velocity.x * dt;
      const ny = pos.y + drop.velocity.y * dt;
      const nz = pos.z + drop.velocity.z * dt;
      // простая коллизия с миром
      if (this.world.isSolid(Math.floor(nx), Math.floor(pos.y + 0.15), Math.floor(pos.z))) {
        drop.velocity.x = 0;
      } else pos.x = nx;
      if (this.world.isSolid(Math.floor(pos.x), Math.floor(ny + 0.15), Math.floor(pos.z))) {
        if (drop.velocity.y < 0) {
          drop.velocity.y = 0;
          drop.velocity.x *= 0.6;
          drop.velocity.z *= 0.6;
          pos.y = Math.floor(ny + 0.15) + 1 - 0.15;
        }
      } else pos.y = ny;
      if (this.world.isSolid(Math.floor(pos.x), Math.floor(pos.y + 0.15), Math.floor(nz))) {
        drop.velocity.z = 0;
      } else pos.z = nz;

      drop.mesh.rotation.y += dt * 2.2;

      // подбор
      if (drop.age > drop.pickupDelay) {
        const p = this.player.position;
        const d = Math.hypot(pos.x - p.x, pos.y - (p.y + 0.9), pos.z - p.z);
        if (d < 1.6) {
          const left = this.inventory.add(drop.name, 1);
          if (left === 0) {
            this.audio.pickup();
            this.ui.refreshHotbar();
            this.ui.toast(`+1 ${getBlock(drop.id).label}`, drop.id);
            this.disposeDrop(drop);
            this.droppedItems.splice(i, 1);
            continue;
          }
        }
      }
      if (drop.age > 300) {
        this.disposeDrop(drop);
        this.droppedItems.splice(i, 1);
      }
    }
  }

  disposeDrop(drop) {
    this.renderer.scene.remove(drop.mesh);
    drop.mesh.geometry.dispose();
  }

  // ---------- ТНТ ----------
  igniteTNT(x, y, z) {
    if (this.tntList.some((t) => t.x === x && t.y === y && t.z === z)) return;
    this.tntList.push({ x, y, z, time: 2.2, blink: 0 });
    this.audio.tone({ freq: 900, duration: 0.08, type: 'square', gain: 0.08 });
    this.ui.toast('ТНТ подожжён! Беги!');
  }

  updateTNT(dt) {
    for (let i = this.tntList.length - 1; i >= 0; i--) {
      const tnt = this.tntList[i];
      tnt.time -= dt;
      tnt.blink += dt;
      if (Math.random() < dt * 8) {
        this.renderer.spawnBlockParticles(tnt.x, tnt.y + 1, tnt.z, ID.sand, 1);
      }
      if (tnt.time <= 0) {
        this.explode(tnt.x, tnt.y, tnt.z);
        this.tntList.splice(i, 1);
      }
    }
  }

  explode(x, y, z) {
    const radius = 4.2;
    const r = Math.ceil(radius);
    this.audio.explosion();
    this.ui.toast('💥 Бум!');

    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > radius) continue;
          const bx = x + dx;
          const by = y + dy;
          const bz = z + dz;
          if (by < 0 || by >= WORLD_HEIGHT) continue;
          const id = this.world.getBlock(bx, by, bz);
          if (id === AIR) continue;
          const def = getBlock(id);
          if (def.hardness === Infinity) continue;
          this.world.setBlock(bx, by, bz, AIR);
          if (Math.random() < 0.35) this.renderer.spawnBlockParticles(bx, by, bz, id, 1);
        }
      }
    }

    // Частицы взрыва
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 6 + Math.random() * 14;
      this.renderer.spawnBurstParticle(
        x + 0.5, y + 0.5, z + 0.5,
        Math.cos(a) * Math.cos(b) * sp,
        Math.sin(b) * sp + 4,
        Math.sin(a) * Math.cos(b) * sp,
        Math.random() < 0.5 ? 0xffb347 : 0x777777
      );
    }

    // Урон игроку
    const p = this.player.position;
    const d = Math.hypot(p.x - x, p.y - y, p.z - z);
    if (d < radius + 1) {
      const dmg = Math.ceil((1 - d / (radius + 1)) * 18);
      if (dmg > 0) this.player.damage(dmg, 'взрыв');
      // отбрасывание
      const kb = (radius + 1 - d) * 1.6;
      const len = Math.max(0.001, Math.hypot(p.x - x, p.y - y, p.z - z));
      this.player.velocity.x += ((p.x - x) / len) * kb;
      this.player.velocity.y += 4 + kb * 0.5;
      this.player.velocity.z += ((p.z - z) / len) * kb;
    }
    // Мобы
    if (this.mobs) {
      for (const mob of this.mobs.mobs) {
        const md = Math.hypot(mob.position.x - x, mob.position.y - y, mob.position.z - z);
        if (md < radius + 2) mob.damage(Math.ceil((1 - md / (radius + 2)) * 20));
      }
    }
    this.afterBlockChange(x, y, z);
  }

  particlesBurst(pos, color, count) {
    for (let i = 0; i < count; i++) {
      this.renderer.spawnBurstParticle(
        pos.x, pos.y + 0.6, pos.z,
        (Math.random() - 0.5) * 4,
        Math.random() * 4,
        (Math.random() - 0.5) * 4,
        color
      );
    }
  }

  // ---------- Чанки ----------
  buildOffsetList() {
    const r = MAX_RENDER_DISTANCE;
    const offsets = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= r * r) offsets.push({ dx, dz, d2 });
      }
    }
    offsets.sort((a, b) => a.d2 - b.d2);
    this.offsets = offsets;
  }

  rebuildNearbyMeshes() {
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE);
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE);
    const r = Math.min(this.renderDistance, 3);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const chunk = this.world.getChunk(pcx + dx, pcz + dz);
        if (chunk && chunk.generated) {
          this.renderer.rebuildChunk(this.world, chunk);
        }
      }
    }
  }

  updateChunks(dt) {
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE);
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE);
    const rd = this.renderDistance;

    const start = performance.now();
    let generated = 0;
    let meshed = 0;
    const budget = 9; // мс на кадр

    // 1. Генерация
    for (const off of this.offsets) {
      if (off.d2 > rd * rd) continue;
      const cx = pcx + off.dx;
      const cz = pcz + off.dz;
      const chunk = this.world.getChunk(cx, cz);
      if (chunk && chunk.generated) continue;
      this.world.generateChunk(cx, cz);
      generated++;
      if (generated >= 1 || performance.now() - start > budget) break;
    }

    // 2. Меши
    for (const off of this.offsets) {
      if (off.d2 > rd * rd) continue;
      const cx = pcx + off.dx;
      const cz = pcz + off.dz;
      const chunk = this.world.getChunk(cx, cz);
      if (!chunk || !chunk.generated || !chunk.dirty) continue;
      // требуем соседей, чтобы швы были корректны
      const n1 = this.world.getChunk(cx + 1, cz);
      const n2 = this.world.getChunk(cx - 1, cz);
      const n3 = this.world.getChunk(cx, cz + 1);
      const n4 = this.world.getChunk(cx, cz - 1);
      if (!(n1?.generated && n2?.generated && n3?.generated && n4?.generated)) continue;
      this.renderer.rebuildChunk(this.world, chunk);
      meshed++;
      if (meshed >= 1 || performance.now() - start > budget * 1.2) break;
    }

    // 3. Выгрузка дальних
    this.chunkUnloadTimer -= dt;
    if (this.chunkUnloadTimer <= 0) {
      this.chunkUnloadTimer = 1.5;
      const removed = this.world.unloadFar(pcx, pcz, rd + 2, (chunk) => {
        this.renderer.removeChunk(chunkKey(chunk.cx, chunk.cz), chunk);
      });
      void removed;
    }

    this.lastChunkPos = { cx: pcx, cz: pcz };
  }

  // ---------- Цикл ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.016;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.adaptQuality();
    }

    if (!this.running) return;

    const active = !this.paused && !this.inventoryOpen && !this.player.dead;

    if (active) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      const input = {
        forward: this.keys.KeyW || this.keys.ArrowUp,
        back: this.keys.KeyS || this.keys.ArrowDown,
        left: this.keys.KeyA || this.keys.ArrowLeft,
        right: this.keys.KeyD || this.keys.ArrowRight,
        jump: this.keys.Space,
        sneak: this.keys.ShiftLeft || this.keys.ShiftRight,
        sprint: this.keys.ControlLeft || this.keys.ControlRight || this.sprintToggle,
      };
      this.updateFallbackLook(dt);
      this.player.update(dt, input, this.renderer.camera);
      this.checkEnvironmentDamage(dt);
      this.updateTarget();
      this.updateMining(dt);
      this.updateTNT(dt);
      this.updateDroppedItems(dt);
      this.updateGravity(dt);

      const isNight = this.isNight();
      this.mobs.update(dt, this.player, isNight, dt);
      if (!isNight) this.mobs.burnHostileInDaylight(dt, this.renderer);
      this.updateChunks(dt);

      // звук шагов
      const under = this.world.getBlock(
        Math.floor(this.player.position.x),
        Math.floor(this.player.position.y - 0.2),
        Math.floor(this.player.position.z)
      );
      this.audio.updateFootsteps(dt, this.player, soundMaterialFor(getBlock(under)));

      // урон/смерть
      this.ui.setDamageFlash(this.player.hurtTimer > 0.05);
      this.ui.updateVitals(this.player);
      this.ui.setWaterOverlay(this.player.headInWater);

      if (this.player.health <= 0 && !this.player.dead) this.player.dead = true;
    } else {
      // пауза: не двигаем игрока, но камеру ставим
      this.player.updateCamera(this.renderer.camera);
      this.updateChunks(dt);
    }

    // Смерть игрока (проверяется вне блока симуляции)
    if (this.player.dead && !this.deathHandled && this.running) {
      this.deathHandled = true;
      this.mouse.left = false;
      this.mouse.right = false;
      this.keys = {};
      this.mining = null;
      this.ui.setMiningProgress(0);
      document.getElementById('death-cause').textContent =
        this.player.lastCause === 'утонул'
          ? 'Вы утонули.'
          : this.player.lastCause === 'падение'
            ? 'Вы разбились при падении.'
            : this.player.lastCause === 'зомби'
              ? 'Вас съел зомби.'
              : this.player.lastCause === 'взрыв'
              ? 'Вас разорвало взрывом.'
              : this.player.lastCause === 'кактус'
                ? 'Кактус оказался колючим.'
                : this.player.lastCause === 'пустота'
                  ? 'Вы провалились в пустоту.'
                  : 'Мир оказался сильнее.';
      this.ui.showScreen('death-screen');
      this.saveGame(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }

    // Автосейв
    this.autoSaveTimer = (this.autoSaveTimer || 0) + dt;
    if (active && this.autoSaveTimer > 25) {
      this.autoSaveTimer = 0;
      this.saveGame(false);
    }

    this.updatePlayerModel(dt);

    // Свет и окружение
    const dayFactor = this.getDayFactor();
    this.renderer.updateEnvironment(dt, this.timeOfDay, this.player.position, this.player.headInWater);
    this.ambientLight.intensity = 0.32 + dayFactor * 0.72;
    this.sunLight.intensity = 0.18 + dayFactor * 1.15;
    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
    this.sunLight.position.set(
      Math.cos(sunAngle) * 100 + this.player.position.x,
      Math.sin(sunAngle) * 100 + 20,
      Math.cos(sunAngle) * 60 + this.player.position.z
    );

    // Лёгкий «разгон» FOV при беге/полёте
    const baseFov = this.settings.fov;
    const targetFov = baseFov + (this.player.sprinting && this.player.isMoving ? 8 : 0);
    const cam = this.renderer.camera;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
      cam.updateProjectionMatrix();
    }

    this.renderer.updateParticles(dt);
    this.renderer.updateHeld(dt, this.player);
    this.renderer.render();

    // HUD
    if (this.showDebug) {
      const p = this.player.position;
      const info = this.world.generator.columnInfo(Math.floor(p.x), Math.floor(p.z));
      this.ui.setDebug({
        fps: this.fps,
        pos: p,
        biome: this.running ? info.biome : '—',
        block: this.targetHit ? getBlock(this.targetHit.id).label : '—',
        chunks: this.world.chunks.size,
        time: this.formatTime(),
        mode: this.player.flying ? 'полёт' : this.mode === 'creative' ? 'креатив' : 'выживание',
        visible: true,
      });
    } else {
      this.ui.setDebug({ visible: false });
    }
  }

  /** Автоматически снижает дальность прорисовки на слабых машинах */
  adaptQuality() {
    if (this.adaptiveQuality === false) return;
    if (!this.running || this.paused) {
      this.lowFpsFrames = 0;
      return;
    }
    if (this.fps < 26) this.lowFpsFrames = (this.lowFpsFrames || 0) + 1;
    else this.lowFpsFrames = Math.max(0, (this.lowFpsFrames || 0) - 1);

    if (this.lowFpsFrames > 8 && this.renderDistance > MIN_RENDER_DISTANCE + 1) {
      this.lowFpsFrames = 0;
      this.renderDistance = Math.max(MIN_RENDER_DISTANCE + 1, this.renderDistance - 2);
      this.settings.renderDistance = this.renderDistance;
      this.renderer.setRenderDistance(this.renderDistance);
      this.saveSettings();
      document.getElementById('rd-input').value = this.renderDistance;
      document.getElementById('rd-value').textContent = this.renderDistance;
      this.ui.toast(`Низкий FPS — дальность прорисовки снижена до ${this.renderDistance}`);
    }
  }

  /** Урон от кактусов, пустоты и падения в лаву-подобные места */
  checkEnvironmentDamage(dt) {
    const p = this.player;
    if (p.dead || p.invulnerable > 0) return;
    const half = 0.32;
    const minX = Math.floor(p.position.x - half);
    const maxX = Math.floor(p.position.x + half);
    const minZ = Math.floor(p.position.z - half);
    const maxZ = Math.floor(p.position.z + half);
    const minY = Math.floor(p.position.y + 0.1);
    const maxY = Math.floor(p.position.y + 1.5);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.getBlock(x, y, z) === ID.cactus) {
            this.player.damage(1, 'кактус');
            this.player.invulnerable = 0.7;
            this.audio.hurt();
            return;
          }
        }
      }
    }
    // пустота
    if (p.position.y < -3) {
      this.voidTimer = (this.voidTimer || 0) + dt;
      if (this.voidTimer > 0.6) {
        this.voidTimer = 0;
        p.damage(2, 'пустота');
        this.audio.hurt();
      }
    }
  }

  active() {
    return !this.paused && !this.inventoryOpen && !this.player.dead && this.running;
  }

  getDayFactor() {
    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const height = Math.sin(sunAngle);
    return clamp((height + 0.12) / 0.45, 0, 1);
  }

  isNight() {
    return this.getDayFactor() < 0.28;
  }

  formatTime() {
    const totalMinutes = this.timeOfDay * 24 * 60;
    const hh = Math.floor(totalMinutes / 60);
    const mm = Math.floor(totalMinutes % 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  updatePlayerModel(dt) {
    if (!this.playerModel) return;
    const show = this.player.viewMode === 1 && !this.player.dead;
    this.playerModel.group.visible = show;
    if (!show) return;
    const g = this.playerModel.group;
    g.position.set(this.player.position.x, this.player.position.y + 0.05, this.player.position.z);
    g.rotation.y = this.player.yaw + Math.PI;

    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.modelAnimTime = (this.modelAnimTime || 0) + dt * (2 + speed * 1.6);
    const swing = speed > 0.4 ? Math.sin(this.modelAnimTime * 3) * 0.7 : 0;
    this.playerModel.legL.rotation.x = swing;
    this.playerModel.legR.rotation.x = -swing;
    this.playerModel.armL.rotation.x = -swing * 0.8;
    this.playerModel.armR.rotation.x = swing * 0.8;

    // модель не должна перекрывать камеру в 3-м лице благодаря позиции камеры
    if (this.player.sneaking) g.position.y -= 0.15;
  }
}

// ---------- Публичный старт ----------
const game = new Game();
window.__game = game; // для отладки и тестов

// Небольшая подсказка от браузера
document.addEventListener('DOMContentLoaded', () => {
  const isTouch = 'ontouchstart' in window && window.innerWidth < 900;
  if (isTouch) {
    document.getElementById('mobile-note').classList.remove('hidden');
  }
});

export default game;
