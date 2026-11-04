import { makeMessage, renderStats, readBest, saveBest } from './shared.js';

const SIZE = 20;
const KEY_DIRECTIONS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
const VECTORS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function mountSnake({ host, controls, stats }) {
  host.innerHTML = `
    <div class="snake-wrap">
      <canvas class="snake-canvas" width="440" height="440" tabindex="0" aria-label="Поле игры Змейка. Управление стрелками, WASD или кнопками ниже."></canvas>
      <div class="control-pad" aria-label="Управление змейкой">
        <button type="button" data-dir="up" aria-label="Вверх">↑</button>
        <button type="button" data-dir="left" aria-label="Влево">←</button>
        <button type="button" data-dir="down" aria-label="Вниз">↓</button>
        <button type="button" data-dir="right" aria-label="Вправо">→</button>
      </div>
    </div>`;
  controls.innerHTML = '<button type="button" id="snake-toggle">▶ Начать</button><span class="toolbar-tip">Управление: стрелки или WASD</span>';

  const canvas = host.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const toggleButton = controls.querySelector('#snake-toggle');
  const announce = makeMessage(host, 'Нажми «Начать», стрелку или коснись поля.');
  const bestKey = 'arcade-best-snake';
  let best = readBest(bestKey);
  let snake = [];
  let direction = 'right';
  let queuedDirection = 'right';
  let food = { x: 14, y: 10 };
  let score = 0;
  let running = false;
  let over = false;
  let timeout = null;
  let disposed = false;
  let pointerStart = null;

  function placeFood() {
    const free = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y });
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function updateStats() {
    renderStats(stats, [['Очки', score], ['Рекорд', best], ['Длина', snake.length], ['Темп', score < 10 ? 'Спокойный' : score < 30 ? 'Быстрый' : 'Турбо']]);
  }

  function reset() {
    window.clearTimeout(timeout);
    timeout = null;
    running = false;
    over = false;
    score = 0;
    direction = 'right';
    queuedDirection = 'right';
    snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }, { x: 2, y: 10 }];
    food = { x: 14, y: 10 };
    toggleButton.textContent = '▶ Начать';
    announce('Нажми «Начать», стрелку или коснись поля.');
    updateStats();
    draw();
  }

  function gameOver(won = false) {
    running = false;
    over = true;
    window.clearTimeout(timeout);
    timeout = null;
    toggleButton.textContent = '↻ Ещё раз';
    announce(won ? `Победа! Заполнил всё поле — ${score} очков.` : `Игра окончена. Счёт: ${score}. Нажми, чтобы сыграть ещё раз.`);
    draw();
  }

  function tick() {
    if (!running || disposed) return;
    direction = queuedDirection;
    const vector = VECTORS[direction];
    const head = { x: snake[0].x + vector.x, y: snake[0].y + vector.y };
    const isFood = food && head.x === food.x && head.y === food.y;
    const body = isFood ? snake : snake.slice(0, -1);
    const hitWall = head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE;
    const hitBody = body.some((part) => part.x === head.x && part.y === head.y);
    if (hitWall || hitBody) { gameOver(); return; }
    snake.unshift(head);
    if (isFood) {
      score += 1;
      if (score > best) { best = score; saveBest(bestKey, best); }
      food = placeFood();
      if (!food) { updateStats(); gameOver(true); return; }
      announce('Яблоко съедено! Отличный темп.');
    } else {
      snake.pop();
    }
    updateStats();
    draw();
    timeout = window.setTimeout(tick, Math.max(66, 145 - score * 2));
  }

  function start() {
    if (running) {
      running = false;
      window.clearTimeout(timeout);
      timeout = null;
      toggleButton.textContent = '▶ Продолжить';
      announce('Пауза. Нажми «Продолжить», когда будешь готов.');
      return;
    }
    if (over) reset();
    running = true;
    toggleButton.textContent = 'Ⅱ Пауза';
    announce('Вперёд за яблоками!');
    timeout = window.setTimeout(tick, Math.max(66, 145 - score * 2));
  }

  function requestDirection(next) {
    if (!VECTORS[next]) return;
    if (!running && over) reset();
    if (next !== OPPOSITE[direction]) queuedDirection = next;
    if (!running) {
      running = true;
      toggleButton.textContent = 'Ⅱ Пауза';
      announce('Вперёд за яблоками!');
      timeout = window.setTimeout(tick, 145);
    }
  }

  function draw() {
    if (disposed || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const cell = width / SIZE;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101527';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(139,151,200,.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
      const p = i * cell;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(width, p); ctx.stroke();
    }
    if (food) {
      const fx = (food.x + .5) * cell; const fy = (food.y + .5) * cell;
      ctx.fillStyle = 'rgba(255,119,112,.19)';
      ctx.beginPath(); ctx.arc(fx, fy, cell * .42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff746c';
      ctx.beginPath(); ctx.arc(fx, fy, cell * .26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#94dc95'; ctx.lineWidth = Math.max(1.5, cell * .06);
      ctx.beginPath(); ctx.moveTo(fx, fy - cell * .23); ctx.quadraticCurveTo(fx + cell * .1, fy - cell * .44, fx + cell * .25, fy - cell * .36); ctx.stroke();
    }
    snake.forEach((part, index) => {
      const inset = index === 0 ? cell * .075 : cell * .11;
      const x = part.x * cell + inset; const y = part.y * cell + inset;
      const size = cell - inset * 2;
      const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, index === 0 ? '#dcff84' : '#b4ec73');
      gradient.addColorStop(1, index === 0 ? '#8bdc86' : '#62c78d');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, cell * .23);
      ctx.fill();
      if (index === 0) {
        const eyes = direction === 'up' ? [[.34, .29], [.66, .29]] : direction === 'down' ? [[.34, .71], [.66, .71]] : direction === 'left' ? [[.29, .34], [.29, .66]] : [[.71, .34], [.71, .66]];
        ctx.fillStyle = '#173449';
        for (const [ex, ey] of eyes) {
          ctx.beginPath(); ctx.arc(x + size * ex, y + size * ey, cell * .055, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
  }

  toggleButton.addEventListener('click', start);
  host.querySelector('.control-pad').addEventListener('click', (event) => {
    const button = event.target.closest('[data-dir]');
    if (button) requestDirection(button.dataset.dir);
  });
  const onKey = (event) => {
    const next = KEY_DIRECTIONS[event.key];
    if (!next) return;
    event.preventDefault();
    requestDirection(next);
  };
  document.addEventListener('keydown', onKey);
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
      if (!running) start();
      return;
    }
    requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  window.addEventListener('resize', draw);
  reset();
  return {
    restart: reset,
    destroy() {
      disposed = true;
      window.clearTimeout(timeout);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', draw);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    },
  };
}
