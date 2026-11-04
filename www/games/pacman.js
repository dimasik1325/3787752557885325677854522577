import { makeMessage, renderStats, readBest, saveBest } from './shared.js';

const WIDTH = 19;
const HEIGHT = 21;
const TILE = 22;
const DIRECTIONS = {
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
};
const KEY_DIRECTIONS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
const START = { x: 9, y: 19 };
const GHOST_STARTS = [
  { x: 9, y: 10, color: '#ff738c' },
  { x: 8, y: 10, color: '#61dbec' },
  { x: 10, y: 10, color: '#ffb35d' },
];

function createWalls() {
  const walls = new Set();
  const put = (x, y) => walls.add(`${x},${y}`);
  for (let x = 0; x < WIDTH; x++) { put(x, 0); put(x, HEIGHT - 1); }
  for (let y = 0; y < HEIGHT; y++) { put(0, y); put(WIDTH - 1, y); }
  const bands = [
    [2, [[2, 5], [7, 11], [13, 16]]], [3, [[2, 5], [7, 11], [13, 16]]],
    [5, [[2, 4], [6, 8], [10, 12], [14, 16]]], [6, [[2, 4], [6, 8], [10, 12], [14, 16]]],
    [8, [[4, 6], [8, 10], [12, 14]]], [9, [[4, 6], [8, 10], [12, 14]]],
    [11, [[2, 5], [7, 11], [13, 16]]], [12, [[2, 5], [7, 11], [13, 16]]],
    [14, [[2, 4], [6, 8], [10, 12], [14, 16]]], [15, [[2, 4], [6, 8], [10, 12], [14, 16]]],
    [17, [[3, 5], [7, 11], [13, 15]]],
  ];
  for (const [y, segments] of bands) for (const [from, to] of segments) for (let x = from; x <= to; x++) put(x, y);
  // Short vertical walls add a few turns without closing off any corridor.
  for (const [x, from, to] of [[4, 3, 4], [14, 3, 4], [6, 10, 10], [12, 10, 10], [4, 16, 16], [14, 16, 16]]) {
    for (let y = from; y <= to; y++) put(x, y);
  }
  // Keep all spawn and power-pellet cells open.
  for (const p of [START, ...GHOST_STARTS, { x: 1, y: 1 }, { x: 17, y: 1 }, { x: 1, y: 19 }, { x: 17, y: 19 }]) walls.delete(`${p.x},${p.y}`);
  return walls;
}
const WALLS = createWalls();
const POWER_CELLS = new Set(['1,1', '17,1', '1,19', '17,19']);

export function mountPacman({ host, controls, stats }) {
  host.innerHTML = `
    <div class="pacman-wrap">
      <canvas class="pacman-canvas" width="${WIDTH * TILE}" height="${HEIGHT * TILE}" tabindex="0" aria-label="Игровое поле PAC-MAN. Управление стрелками на клавиатуре или кнопками ниже."></canvas>
      <div class="control-pad" aria-label="Управление PAC-MAN">
        <button type="button" data-dir="up" aria-label="Вверх">↑</button>
        <button type="button" data-dir="left" aria-label="Влево">←</button>
        <button type="button" data-dir="down" aria-label="Вниз">↓</button>
        <button type="button" data-dir="right" aria-label="Вправо">→</button>
      </div>
    </div>`;
  controls.innerHTML = '<button type="button" id="pacman-toggle">▶ Начать</button><span class="toolbar-tip">Собери все точки</span>';

  const canvas = host.querySelector('canvas');
  const context = canvas.getContext('2d');
  const toggleButton = controls.querySelector('#pacman-toggle');
  const announce = makeMessage(host, 'Нажми «Начать» или любую стрелку.');
  const bestKey = 'arcade-best-pacman';
  let best = readBest(bestKey);
  let timer = null;
  let running = false;
  let disposed = false;
  let tickNo = 0;
  let powerTicks = 0;
  let score = 0;
  let lives = 3;
  let dots = new Map();
  let player = { ...START, direction: 'left', nextDirection: null };
  let ghosts = [];
  let canvasWidth = canvas.width;
  let canvasHeight = canvas.height;

  function reset() {
    clearInterval(timer);
    timer = null;
    running = false;
    tickNo = 0;
    powerTicks = 0;
    score = 0;
    lives = 3;
    player = { ...START, direction: 'left', nextDirection: null };
    ghosts = GHOST_STARTS.map((ghost) => ({ ...ghost, startX: ghost.x, startY: ghost.y, direction: 'left' }));
    dots = new Map();
    for (let y = 1; y < HEIGHT - 1; y++) {
      for (let x = 1; x < WIDTH - 1; x++) {
        const key = `${x},${y}`;
        if (!WALLS.has(key) && !(x === START.x && y === START.y) && !GHOST_STARTS.some((ghost) => ghost.x === x && ghost.y === y)) {
          dots.set(key, POWER_CELLS.has(key) ? 'power' : 'dot');
        }
      }
    }
    toggleButton.textContent = '▶ Начать';
    announce('Нажми «Начать» или любую стрелку.');
    updateStats();
    draw();
  }

  function updateStats() {
    renderStats(stats, [['Очки', score], ['Рекорд', best], ['Жизни', '♥'.repeat(lives) || '—'], ['Точки', dots.size]]);
  }

  function canMove(x, y) {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && !WALLS.has(`${x},${y}`);
  }

  function moveFrom(point, direction) {
    const vector = DIRECTIONS[direction];
    return vector && canMove(point.x + vector.x, point.y + vector.y)
      ? { x: point.x + vector.x, y: point.y + vector.y }
      : null;
  }

  function eatCell() {
    const key = `${player.x},${player.y}`;
    const item = dots.get(key);
    if (!item) return;
    dots.delete(key);
    score += item === 'power' ? 50 : 10;
    if (item === 'power') {
      powerTicks = 42;
      announce('Суперточка! Привидения теперь можно съесть.');
    }
    if (score > best) {
      best = score;
      saveBest(bestKey, best);
    }
    if (dots.size === 0) {
      stopGame();
      announce('Победа! Лабиринт очищен — отличная работа.');
    }
    updateStats();
  }

  function moveGhost(ghost) {
    const possible = Object.keys(DIRECTIONS).map((direction) => ({ direction, point: moveFrom(ghost, direction) })).filter((entry) => entry.point);
    if (possible.length < 1) return;
    const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' }[ghost.direction];
    const choices = possible.filter((entry) => entry.direction !== reverse);
    const pool = choices.length ? choices : possible;
    if (powerTicks > 0 || Math.random() < .23) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      ghost.x = pick.point.x; ghost.y = pick.point.y; ghost.direction = pick.direction;
      return;
    }
    const ranked = pool.map((entry) => ({ ...entry, distance: Math.abs(entry.point.x - player.x) + Math.abs(entry.point.y - player.y) }))
      .sort((a, b) => a.distance - b.distance);
    const pick = ranked[Math.floor(Math.random() * Math.min(2, ranked.length))];
    ghost.x = pick.point.x; ghost.y = pick.point.y; ghost.direction = pick.direction;
  }

  function collideWithGhosts() {
    const ghost = ghosts.find((item) => item.x === player.x && item.y === player.y);
    if (!ghost) return false;
    if (powerTicks > 0) {
      score += 200;
      if (score > best) { best = score; saveBest(bestKey, best); }
      ghost.x = ghost.startX; ghost.y = ghost.startY; ghost.direction = 'left';
      announce('Привидение съедено! +200');
      updateStats();
      return false;
    }
    lives -= 1;
    if (lives <= 0) {
      stopGame();
      toggleButton.textContent = '↻ Сначала';
      announce(`Игра окончена. Твой счёт — ${score}. Нажми, чтобы сыграть ещё раз.`);
    } else {
      player = { ...START, direction: 'left', nextDirection: null };
      ghosts = GHOST_STARTS.map((item) => ({ ...item, startX: item.x, startY: item.y, direction: 'left' }));
      stopGame();
      toggleButton.textContent = '▶ Продолжить';
      announce(`Потеряна жизнь. Осталось ${lives}. Нажми «Продолжить».`);
    }
    updateStats();
    return true;
  }

  function step() {
    tickNo++;
    if (player.nextDirection) {
      const turn = moveFrom(player, player.nextDirection);
      if (turn) player.direction = player.nextDirection;
    }
    const next = moveFrom(player, player.direction);
    if (next) { player.x = next.x; player.y = next.y; }
    eatCell();
    if (!running) { draw(); return; }
    if (tickNo % 2 === 0) for (const ghost of ghosts) moveGhost(ghost);
    if (powerTicks > 0) powerTicks--;
    if (collideWithGhosts()) { draw(); return; }
    updateStats();
    draw();
  }

  function startGame() {
    if (dots.size === 0 || lives === 0) { reset(); }
    running = true;
    toggleButton.textContent = 'Ⅱ Пауза';
    announce('Вперёд! Собирай точки и остерегайся привидений.');
    timer = window.setInterval(step, 155);
  }

  function stopGame() {
    running = false;
    clearInterval(timer);
    timer = null;
  }

  function toggle() {
    if (running) {
      stopGame();
      toggleButton.textContent = '▶ Продолжить';
      announce('Пауза. Нажми «Продолжить», когда будешь готов.');
      return;
    }
    if (lives === 0 || dots.size === 0) reset();
    startGame();
  }

  function requestDirection(direction) {
    player.nextDirection = direction;
    if (!running) {
      if (lives === 0 || dots.size === 0) reset();
      startGame();
    }
    canvas.focus({ preventScroll: true });
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    context.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    draw();
  }

  function drawGhost(ghost) {
    const x = ghost.x + .5;
    const y = ghost.y + .5;
    const frightened = powerTicks > 0;
    const color = frightened ? (powerTicks < 12 && tickNo % 4 < 2 ? '#e9f0ff' : '#596fe0') : ghost.color;
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y - .04, .37, Math.PI, 0);
    context.lineTo(x + .37, y + .36);
    context.lineTo(x + .18, y + .25);
    context.lineTo(x, y + .38);
    context.lineTo(x - .18, y + .25);
    context.lineTo(x - .37, y + .36);
    context.closePath();
    context.fill();
    if (frightened) {
      context.fillStyle = '#fff';
      context.fillRect(x - .19, y - .06, .07, .08);
      context.fillRect(x + .12, y - .06, .07, .08);
      context.fillStyle = '#fff';
      context.fillRect(x - .2, y + .13, .09, .04);
      context.fillRect(x - .03, y + .13, .09, .04);
      context.fillRect(x + .14, y + .13, .09, .04);
      return;
    }
    context.fillStyle = '#fff';
    context.beginPath(); context.ellipse(x - .13, y - .03, .105, .14, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(x + .13, y - .03, .105, .14, 0, 0, Math.PI * 2); context.fill();
    const gaze = DIRECTIONS[ghost.direction] || DIRECTIONS.left;
    context.fillStyle = '#1b2b56';
    context.beginPath(); context.arc(x - .13 + gaze.x * .04, y - .015 + gaze.y * .04, .05, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(x + .13 + gaze.x * .04, y - .015 + gaze.y * .04, .05, 0, Math.PI * 2); context.fill();
  }

  function draw() {
    if (disposed || !context) return;
    context.save();
    context.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#0c1020';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    for (const key of WALLS) {
      const [x, y] = key.split(',').map(Number);
      context.fillStyle = '#222c57';
      context.fillRect(x + .06, y + .06, .88, .88);
      context.strokeStyle = '#5264b4';
      context.lineWidth = .055;
      context.strokeRect(x + .09, y + .09, .82, .82);
      context.fillStyle = 'rgba(118,139,255,.12)';
      context.fillRect(x + .13, y + .13, .74, .11);
    }
    for (const [key, type] of dots) {
      const [x, y] = key.split(',').map(Number);
      if (type === 'power') {
        const pulse = .19 + (Math.sin(tickNo * .24) + 1) * .035;
        context.fillStyle = '#ffe8a0';
        context.beginPath(); context.arc(x + .5, y + .5, pulse, 0, Math.PI * 2); context.fill();
      } else {
        context.fillStyle = '#f6deaa';
        context.beginPath(); context.arc(x + .5, y + .5, .075, 0, Math.PI * 2); context.fill();
      }
    }
    for (const ghost of ghosts) drawGhost(ghost);
    const direction = DIRECTIONS[player.direction] || DIRECTIONS.right;
    const mouth = running ? .13 + Math.abs(Math.sin(tickNo * .55)) * .36 : .12;
    const centerX = player.x + .5; const centerY = player.y + .5;
    context.fillStyle = '#ffdc4e';
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, .4, direction.angle + mouth, direction.angle + Math.PI * 2 - mouth);
    context.closePath(); context.fill();
    context.restore();
  }

  toggleButton.addEventListener('click', toggle);
  host.querySelector('.control-pad').addEventListener('click', (event) => {
    const button = event.target.closest('[data-dir]');
    if (button) requestDirection(button.dataset.dir);
  });
  const onKey = (event) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    requestDirection(direction);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', resizeCanvas);
  reset();
  requestAnimationFrame(resizeCanvas);

  return {
    restart: reset,
    destroy() {
      disposed = true;
      stopGame();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resizeCanvas);
    },
  };
}
