import { makeMessage, renderStats, readBest, saveBest } from './shared.js';

const LEVELS = {
  easy: { label: 'Новичок', rows: 9, cols: 9, mines: 10, cell: 39 },
  medium: { label: 'Любитель', rows: 12, cols: 12, mines: 20, cell: 34 },
  hard: { label: 'Эксперт', rows: 16, cols: 16, mines: 40, cell: 29 },
};

export function mountMinesweeper({ host, controls, stats }) {
  host.innerHTML = '<div class="mines-wrap"><div class="mines-board-scroller"><div class="mines-board" role="grid" aria-label="Игровое поле сапёра"></div></div></div>';
  controls.innerHTML = `
    <label class="sr-only" for="mine-difficulty">Сложность</label>
    <select class="mine-select" id="mine-difficulty" aria-label="Сложность игры">
      <option value="easy">Новичок · 9×9</option><option value="medium">Любитель · 12×12</option><option value="hard">Эксперт · 16×16</option>
    </select>
    <button class="mine-flag-toggle" id="mine-flag" type="button" aria-pressed="false">⚑ Флажок: выкл.</button>`;

  const board = host.querySelector('.mines-board');
  const difficulty = controls.querySelector('#mine-difficulty');
  const flagButton = controls.querySelector('#mine-flag');
  const announce = makeMessage(host, 'Открой любую клетку, чтобы начать.');
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarsePointer) flagButton.classList.add('is-visible');
  let level = 'easy';
  let config = LEVELS[level];
  let cells = [];
  let flags = 0;
  let revealed = 0;
  let firstMove = true;
  let flagMode = false;
  let finished = false;
  let seconds = 0;
  let timer = null;
  let hitCell = -1;
  let disposed = false;

  function formatTime(value) {
    const mins = Math.floor(value / 60).toString().padStart(2, '0');
    const secs = (value % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function updateStats() {
    const best = readBest(`arcade-best-mines-${level}`);
    renderStats(stats, [
      ['Мин осталось', Math.max(0, config.mines - flags)],
      ['Время', formatTime(seconds)],
      ['Открыто', `${revealed}/${config.rows * config.cols - config.mines}`],
      ['Рекорд', best ? formatTime(best) : '—'],
    ]);
  }

  function reset(nextLevel = level) {
    window.clearInterval(timer);
    timer = null;
    level = nextLevel;
    config = LEVELS[level];
    cells = Array.from({ length: config.rows * config.cols }, () => ({ mine: false, near: 0, opened: false, flagged: false }));
    flags = 0;
    revealed = 0;
    firstMove = true;
    flagMode = false;
    finished = false;
    seconds = 0;
    hitCell = -1;
    flagButton.setAttribute('aria-pressed', 'false');
    flagButton.textContent = '⚑ Флажок: выкл.';
    difficulty.value = level;
    board.style.setProperty('--mine-cols', config.cols);
    board.style.setProperty('--mine-cell', `${config.cell}px`);
    renderBoard();
    updateStats();
    announce('Открой любую клетку, чтобы начать.');
  }

  function adjacent(index) {
    const row = Math.floor(index / config.cols);
    const col = index % config.cols;
    const result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = col + dx; const y = row + dy;
      if (x >= 0 && x < config.cols && y >= 0 && y < config.rows) result.push(y * config.cols + x);
    }
    return result;
  }

  function placeMines(safeIndex) {
    const safe = new Set([safeIndex, ...adjacent(safeIndex)]);
    const candidates = cells.map((_, index) => index).filter((index) => !safe.has(index));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const index of candidates.slice(0, config.mines)) cells[index].mine = true;
    cells.forEach((cell, index) => { if (!cell.mine) cell.near = adjacent(index).filter((n) => cells[n].mine).length; });
    firstMove = false;
    timer = window.setInterval(() => {
      if (finished || disposed) return;
      seconds += 1;
      updateStats();
    }, 1000);
  }

  function renderBoard() {
    board.innerHTML = cells.map((cell, index) => {
      let content = '';
      let classes = 'mine-cell';
      let numberAttr = '';
      let label = `Клетка ${Math.floor(index / config.cols) + 1}, ${index % config.cols + 1}, закрыта`;
      if (cell.opened) {
        classes += ' is-open';
        if (cell.mine) {
          content = '✹'; classes += ' is-mine';
          if (index === hitCell) classes += ' is-hit';
          label = index === hitCell ? 'Мина, вы проиграли' : 'Мина';
        } else if (cell.near > 0) {
          content = String(cell.near); numberAttr = ` data-number="${cell.near}"`;
          label = `${cell.near} мин рядом`;
        } else {
          label = 'Пусто, мин рядом нет';
        }
      } else if (cell.flagged) {
        content = '⚑'; classes += ' is-flag'; label = 'Флажок, помечено как мина';
      }
      return `<button class="${classes}" type="button" role="gridcell" data-index="${index}"${numberAttr} aria-label="${label}"${cell.opened || finished ? ' disabled' : ''}>${content}</button>`;
    }).join('');
  }

  function startIfNeeded(index) {
    if (firstMove) placeMines(index);
  }

  function finish(won) {
    finished = true;
    window.clearInterval(timer);
    timer = null;
    if (won) {
      const key = `arcade-best-mines-${level}`;
      const best = readBest(key);
      if (!best || seconds < best) saveBest(key, seconds);
      cells.forEach((cell) => { if (cell.mine && !cell.flagged) { cell.flagged = true; flags++; } });
      announce(`Победа! Поле очищено за ${formatTime(seconds)}.`);
    } else {
      cells.forEach((cell) => { if (cell.mine) cell.opened = true; });
      announce('Бум! На этот раз не повезло. Попробуй ещё раз.');
    }
    renderBoard();
    updateStats();
  }

  function checkWin() {
    if (revealed === config.rows * config.cols - config.mines) finish(true);
  }

  function openCell(index) {
    if (finished || cells[index].opened || cells[index].flagged) return;
    startIfNeeded(index);
    const cell = cells[index];
    if (cell.mine) {
      hitCell = index;
      cell.opened = true;
      finish(false);
      return;
    }
    const queue = [index];
    const visited = new Set();
    while (queue.length) {
      const current = queue.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      const currentCell = cells[current];
      if (currentCell.opened || currentCell.flagged || currentCell.mine) continue;
      currentCell.opened = true;
      revealed += 1;
      if (currentCell.near === 0) {
        for (const neighbor of adjacent(current)) if (!visited.has(neighbor) && !cells[neighbor].mine) queue.push(neighbor);
      }
    }
    renderBoard();
    updateStats();
    checkWin();
    if (!finished) announce('Хорошо! Смотри на числа и открывай соседние клетки.');
  }

  function toggleFlag(index) {
    if (finished || cells[index].opened) return;
    const cell = cells[index];
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    renderBoard();
    updateStats();
    announce(cell.flagged ? 'Флажок поставлен.' : 'Флажок снят.');
  }

  board.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button || finished) return;
    const index = Number(button.dataset.index);
    if (flagMode) toggleFlag(index);
    else openCell(index);
  });
  board.addEventListener('contextmenu', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    event.preventDefault();
    toggleFlag(Number(button.dataset.index));
  });
  difficulty.addEventListener('change', () => reset(difficulty.value));
  flagButton.addEventListener('click', () => {
    flagMode = !flagMode;
    flagButton.setAttribute('aria-pressed', String(flagMode));
    flagButton.textContent = `⚑ Флажок: ${flagMode ? 'вкл.' : 'выкл.'}`;
    announce(flagMode ? 'Режим флажков. Нажимай на клетки, чтобы пометить мину.' : 'Режим открытия клеток.');
  });
  reset();

  return {
    restart: () => reset(level),
    destroy() {
      disposed = true;
      window.clearInterval(timer);
    },
  };
}
