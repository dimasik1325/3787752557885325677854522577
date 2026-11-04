import { makeMessage, renderStats, readBest, saveBest } from './shared.js';

const BOARD_SIZE = 10;
const SHAPES = [
  { name: 'Кубик', color: '#ffb65e', cells: [[0, 0]] },
  { name: 'Двойка', color: '#fb8c85', cells: [[0, 0], [1, 0]] },
  { name: 'Тройка', color: '#e88ad1', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'Линия 4', color: '#958bff', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: 'Линия 5', color: '#79bfff', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { name: 'Столбик', color: '#69d7c0', cells: [[0, 0], [0, 1], [0, 2]] },
  { name: 'Квадрат', color: '#f0d35d', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'Квадрат 3', color: '#f2a66e', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] },
  { name: 'Уголок', color: '#80dd8c', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { name: 'Ломаная', color: '#69b8ec', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { name: 'Ти', color: '#ba91ff', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: 'Плюс', color: '#ff8eae', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  { name: 'Скоба', color: '#f28c68', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { name: 'Зигзаг', color: '#81c7ab', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
];

function dimensions(cells) {
  return { width: Math.max(...cells.map(([x]) => x)) + 1, height: Math.max(...cells.map(([, y]) => y)) + 1 };
}

export function mountBlockBlast({ host, controls, stats }) {
  host.innerHTML = `
    <div class="blockblast-wrap">
      <div class="block-board" role="grid" aria-label="Поле Block Blast"></div>
      <div class="block-tray" aria-label="Доступные фигуры"></div>
    </div>`;
  controls.innerHTML = '<span class="toolbar-tip">Выбери фигуру и нажми на поле</span>';
  const board = host.querySelector('.block-board');
  const tray = host.querySelector('.block-tray');
  const announce = makeMessage(host, 'Выбери фигуру снизу и поставь её на поле.');
  const bestKey = 'arcade-best-blockblast';
  let best = readBest(bestKey);
  let grid = [];
  let pieces = [];
  let selected = 0;
  let preview = null;
  let score = 0;
  let clearedLines = 0;
  let finished = false;
  let disposed = false;

  function randomPiece() {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return { name: shape.name, color: shape.color, cells: shape.cells.map(([x, y]) => [x, y]) };
  }

  function updateStats() {
    renderStats(stats, [
      ['Очки', score], ['Рекорд', best], ['Линии', clearedLines],
      ['Фигуры', pieces.filter(Boolean).length],
    ]);
  }

  function reset() {
    grid = Array(BOARD_SIZE * BOARD_SIZE).fill(null);
    pieces = [randomPiece(), randomPiece(), randomPiece()];
    selected = 0;
    preview = null;
    score = 0;
    clearedLines = 0;
    finished = false;
    announce('Выбери фигуру снизу и поставь её на поле.');
    render();
  }

  function canPlace(piece, col, row) {
    if (!piece) return false;
    return piece.cells.every(([dx, dy]) => {
      const x = col + dx; const y = row + dy;
      return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && !grid[y * BOARD_SIZE + x];
    });
  }

  function hasAnyMove() {
    return pieces.some((piece) => {
      if (!piece) return false;
      for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) if (canPlace(piece, x, y)) return true;
      return false;
    });
  }

  function setPreview(index) {
    if (finished || selected < 0 || !pieces[selected]) { preview = null; return; }
    const col = index % BOARD_SIZE;
    const row = Math.floor(index / BOARD_SIZE);
    preview = { col, row, valid: canPlace(pieces[selected], col, row) };
  }

  function renderBoard() {
    board.innerHTML = grid.map((color, index) => {
      const content = color ? 'Занятая клетка' : `Пустая клетка, строка ${Math.floor(index / BOARD_SIZE) + 1}, столбец ${index % BOARD_SIZE + 1}`;
      const style = color ? ` style="--piece-color:${color}"` : '';
      return `<button class="block-cell${color ? ' is-filled' : ''}" type="button" role="gridcell" data-cell="${index}" aria-label="${content}"${finished ? ' disabled' : ''}${style}></button>`;
    }).join('');
    applyPreview();
  }

  function applyPreview() {
    const buttons = board.querySelectorAll('[data-cell]');
    buttons.forEach((button) => {
      button.classList.remove('is-preview', 'is-invalid');
      button.style.removeProperty('--preview-color');
    });
    if (!preview || !pieces[selected]) return;
    for (const [dx, dy] of pieces[selected].cells) {
      const col = preview.col + dx; const row = preview.row + dy;
      if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) continue;
      const cell = buttons[row * BOARD_SIZE + col];
      if (!cell || grid[row * BOARD_SIZE + col]) continue;
      cell.classList.add(preview.valid ? 'is-preview' : 'is-invalid');
      cell.style.setProperty('--preview-color', preview.valid ? pieces[selected].color : '#ff7968');
    }
  }

  function renderTray() {
    tray.innerHTML = pieces.map((piece, slot) => {
      if (!piece) return `<div class="block-piece is-used" aria-hidden="true"></div>`;
      const { width, height } = dimensions(piece.cells);
      const occupied = new Set(piece.cells.map(([x, y]) => `${x},${y}`));
      let miniCells = '';
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        miniCells += `<span class="piece-mini-cell${occupied.has(`${x},${y}`) ? '' : ' is-empty'}" style="--piece-color:${piece.color}"></span>`;
      }
      return `<button class="block-piece${slot === selected ? ' is-selected' : ''}" type="button" data-piece-slot="${slot}" draggable="true" aria-label="Фигура ${piece.name}, ${piece.cells.length} блоков" aria-pressed="${slot === selected}">
        <span class="piece-mini" style="grid-template-columns:repeat(${width},12px);grid-template-rows:repeat(${height},12px)">${miniCells}</span>
      </button>`;
    }).join('');
  }

  function render() {
    renderBoard();
    renderTray();
    updateStats();
  }

  function placeAt(index) {
    if (finished || selected < 0 || !pieces[selected]) return;
    const col = index % BOARD_SIZE;
    const row = Math.floor(index / BOARD_SIZE);
    const piece = pieces[selected];
    if (!canPlace(piece, col, row)) {
      announce('Фигура не помещается здесь. Попробуй другое место.');
      preview = { col, row, valid: false };
      renderBoard();
      return;
    }
    for (const [dx, dy] of piece.cells) grid[(row + dy) * BOARD_SIZE + col + dx] = piece.color;
    score += piece.cells.length * 10;
    pieces[selected] = null;
    const fullRows = [];
    const fullCols = [];
    for (let y = 0; y < BOARD_SIZE; y++) if (grid.slice(y * BOARD_SIZE, (y + 1) * BOARD_SIZE).every(Boolean)) fullRows.push(y);
    for (let x = 0; x < BOARD_SIZE; x++) {
      let full = true;
      for (let y = 0; y < BOARD_SIZE; y++) if (!grid[y * BOARD_SIZE + x]) { full = false; break; }
      if (full) fullCols.push(x);
    }
    const cleared = new Set();
    for (const y of fullRows) for (let x = 0; x < BOARD_SIZE; x++) cleared.add(y * BOARD_SIZE + x);
    for (const x of fullCols) for (let y = 0; y < BOARD_SIZE; y++) cleared.add(y * BOARD_SIZE + x);
    for (const cell of cleared) grid[cell] = null;
    const lines = fullRows.length + fullCols.length;
    clearedLines += lines;
    score += lines * 100 + (lines > 1 ? (lines - 1) * 50 : 0);
    if (score > best) { best = score; saveBest(bestKey, best); }
    preview = null;
    if (pieces.every((item) => !item)) {
      pieces = [randomPiece(), randomPiece(), randomPiece()];
      selected = 0;
    } else if (!pieces[selected]) {
      selected = pieces.findIndex(Boolean);
    }
    if (lines) announce(`Отлично! ${lines} ${lines === 1 ? 'линия очищена' : 'линии очищены'} — +${lines * 100} бонусных очков.`);
    else announce(`${piece.name}: +${piece.cells.length * 10}. Продолжай собирать линии.`);
    if (!hasAnyMove()) {
      finished = true;
      announce(`Ходов больше нет. Итог — ${score} очков и ${clearedLines} линий.`);
    }
    render();
  }

  tray.addEventListener('click', (event) => {
    const button = event.target.closest('[data-piece-slot]');
    if (!button || finished) return;
    selected = Number(button.dataset.pieceSlot);
    preview = null;
    renderTray();
    renderBoard();
    announce(`Выбрана фигура ${pieces[selected].name}. Нажми на клетку, куда поставить её.`);
  });
  board.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-cell]');
    if (cell) placeAt(Number(cell.dataset.cell));
  });
  board.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const cell = event.target.closest('[data-cell]');
    if (!cell) return;
    const index = Number(cell.dataset.cell);
    const col = index % BOARD_SIZE;
    const row = Math.floor(index / BOARD_SIZE);
    if (preview && preview.col === col && preview.row === row) return;
    setPreview(index);
    applyPreview();
  });
  board.addEventListener('pointerleave', () => { preview = null; applyPreview(); });
  tray.addEventListener('dragstart', (event) => {
    const button = event.target.closest('[data-piece-slot]');
    if (!button || finished) { event.preventDefault(); return; }
    selected = Number(button.dataset.pieceSlot);
    preview = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(selected));
  });
  board.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-cell]')) event.preventDefault();
  });
  board.addEventListener('drop', (event) => {
    const cell = event.target.closest('[data-cell]');
    if (!cell) return;
    event.preventDefault();
    placeAt(Number(cell.dataset.cell));
  });
  reset();

  return {
    restart: reset,
    destroy() { disposed = true; preview = null; },
  };
}
