import { makeMessage, renderStats, readBest, saveBest } from './shared.js';

const SUITS = [
  { id: 'spades', symbol: '♠', color: 'black', name: 'пики' },
  { id: 'hearts', symbol: '♥', color: 'red', name: 'червы' },
  { id: 'diamonds', symbol: '♦', color: 'red', name: 'бубны' },
  { id: 'clubs', symbol: '♣', color: 'black', name: 'трефы' },
];
const RANKS = { 1: 'Т', 11: 'В', 12: 'Д', 13: 'К' };
const CARD_NAMES = { 1: 'туз', 11: 'валет', 12: 'дама', 13: 'король' };

function rankText(rank) { return RANKS[rank] || String(rank); }
function cardName(card) { return `${CARD_NAMES[card.rank] || card.rank} ${SUITS.find((suit) => suit.id === card.suit).name}`; }
function clonePile(pile) { return pile.map((card) => ({ ...card })); }

export function mountSolitaire({ host, controls, stats }) {
  host.innerHTML = `
    <div class="solitaire-scroller">
      <div class="solitaire-board" aria-label="Пасьянс Клондайк">
        <div class="solitaire-top" id="solitaire-top"></div>
        <div class="solitaire-tableau" id="solitaire-tableau"></div>
      </div>
    </div>`;
  controls.innerHTML = '<button type="button" id="solitaire-undo">↶ Отменить ход</button><span class="toolbar-tip">Двойной клик — в масть</span>';

  const board = host.querySelector('.solitaire-board');
  const topRow = host.querySelector('#solitaire-top');
  const tableauRow = host.querySelector('#solitaire-tableau');
  const undoButton = controls.querySelector('#solitaire-undo');
  const announce = makeMessage(host, 'Нажми на колоду, чтобы открыть карту.');
  let stock = [];
  let waste = [];
  let foundations = SUITS.map(() => []);
  let tableau = Array.from({ length: 7 }, () => []);
  let selection = null;
  let history = [];
  let moves = 0;
  let seconds = 0;
  let timer = null;
  let timerStarted = false;
  let disposed = false;

  function formatTime(value) {
    return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
  }

  function updateStats() {
    renderStats(stats, [
      ['Ходы', moves], ['Время', formatTime(seconds)],
      ['В мастях', foundations.reduce((sum, pile) => sum + pile.length, 0)],
      ['Рекорд ходов', readBest('arcade-best-solitaire') || '—'],
    ]);
    undoButton.disabled = history.length === 0;
    undoButton.style.opacity = history.length === 0 ? '.55' : '1';
  }

  function snapshot() {
    return {
      stock: clonePile(stock), waste: clonePile(waste),
      foundations: foundations.map(clonePile), tableau: tableau.map(clonePile), moves,
    };
  }

  function saveUndo() {
    history.push(snapshot());
    if (history.length > 120) history.shift();
  }

  function startClock() {
    if (timerStarted || disposed) return;
    timerStarted = true;
    timer = window.setInterval(() => {
      seconds += 1;
      updateStats();
    }, 1000);
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ suit: suit.id, rank, faceUp: false });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function reset() {
    window.clearInterval(timer);
    timer = null;
    timerStarted = false;
    seconds = 0;
    moves = 0;
    selection = null;
    history = [];
    foundations = SUITS.map(() => []);
    tableau = Array.from({ length: 7 }, () => []);
    const deck = createDeck();
    for (let column = 0; column < 7; column++) {
      for (let row = 0; row <= column; row++) {
        const card = deck.pop();
        card.faceUp = row === column;
        tableau[column].push(card);
      }
    }
    stock = deck;
    waste = [];
    announce('Нажми на колоду, чтобы открыть карту.');
    render();
  }

  function targetPileMarkup(zone, index, placeholder) {
    return `<div class="solitaire-pile" data-dest-zone="${zone}" data-dest-index="${index}" role="group" aria-label="${placeholder}"><span class="solitaire-placeholder" aria-hidden="true">${placeholder}</span></div>`;
  }

  function cardMarkup(card, zone, pileIndex, cardIndex) {
    const red = SUITS.find((suit) => suit.id === card.suit)?.color === 'red';
    if (!card.faceUp) {
      return `<button class="solitaire-card face-down" type="button" aria-label="Закрытая карта" disabled data-source-zone="${zone}" data-source-index="${pileIndex}" data-card-index="${cardIndex}"></button>`;
    }
    const label = `${cardName(card)}, открыта`;
    const selected = selection && selection.zone === zone && selection.index === pileIndex && selection.cardIndex === cardIndex;
    return `<button class="solitaire-card${red ? ' is-red' : ''}${selected ? ' is-selected' : ''}" type="button" draggable="true" aria-label="${label}" data-source-zone="${zone}" data-source-index="${pileIndex}" data-card-index="${cardIndex}">
      <span class="card-corner">${rankText(card.rank)}<small>${SUITS.find((suit) => suit.id === card.suit).symbol}</small></span>
      <span class="card-center" aria-hidden="true">${SUITS.find((suit) => suit.id === card.suit).symbol}</span>
    </button>`;
  }

  function render() {
    const stockContent = stock.length
      ? '<button class="stock-card is-stock" type="button" data-stock aria-label="Открыть следующую карту">↻</button>'
      : '<button class="stock-card" type="button" data-stock aria-label="Вернуть карты из сброса в колоду">↻</button>';
    const wasteCard = waste.length ? cardMarkup(waste.at(-1), 'waste', 0, waste.length - 1) : '';
    const foundationsMarkup = foundations.map((pile, index) => {
      const card = pile.at(-1);
      const content = card ? cardMarkup(card, 'foundation', index, pile.length - 1) : `<span class="solitaire-placeholder" aria-hidden="true">${SUITS[index].symbol}</span>`;
      return `<div class="solitaire-pile" data-dest-zone="foundation" data-dest-index="${index}" role="group" aria-label="Основание: ${SUITS[index].name}">${content}</div>`;
    }).join('');
    topRow.innerHTML = `${stockContent}${targetPileMarkup('waste', 0, '')}<div aria-hidden="true"></div>${foundationsMarkup}`;
    // Replace the empty waste target with its top card while keeping the target drop zone.
    const wasteSlot = topRow.children[1];
    wasteSlot.setAttribute('aria-label', 'Сброс');
    if (wasteCard) wasteSlot.innerHTML = wasteCard;
    tableauRow.innerHTML = tableau.map((pile, column) => {
      const cards = pile.map((card, cardIndex) => cardMarkup(card, 'tableau', column, cardIndex)).join('');
      const placeholder = pile.length === 0 ? '<span class="solitaire-placeholder" aria-hidden="true">К</span>' : '';
      return `<div class="solitaire-pile" data-dest-zone="tableau" data-dest-index="${column}" role="group" aria-label="Столбец ${column + 1}">${placeholder}${cards}</div>`;
    }).join('');
    updateStats();
  }

  function isSelectable(source) {
    if (!source) return false;
    if (source.zone === 'waste') return source.cardIndex === waste.length - 1 && waste.length > 0;
    if (source.zone === 'foundation') return source.cardIndex === foundations[source.index].length - 1 && foundations[source.index].length > 0;
    if (source.zone === 'tableau') {
      const pile = tableau[source.index];
      return pile[source.cardIndex]?.faceUp === true && pile.slice(source.cardIndex).every((card) => card.faceUp);
    }
    return false;
  }

  function getSequence(source) {
    if (source.zone === 'waste') return [waste[source.cardIndex]];
    if (source.zone === 'foundation') return [foundations[source.index][source.cardIndex]];
    if (source.zone === 'tableau') return tableau[source.index].slice(source.cardIndex);
    return [];
  }

  function sameSource(a, b) {
    return a && b && a.zone === b.zone && a.index === b.index && a.cardIndex === b.cardIndex;
  }

  function canMove(source, destination) {
    if (!source || !destination || !isSelectable(source)) return false;
    if (source.zone === destination.zone && source.index === destination.index) return false;
    const sequence = getSequence(source);
    const first = sequence[0];
    if (!first) return false;
    if (destination.zone === 'tableau') {
      const target = tableau[destination.index];
      if (!target.length) return first.rank === 13;
      const top = target.at(-1);
      const firstColor = SUITS.find((suit) => suit.id === first.suit).color;
      const targetColor = SUITS.find((suit) => suit.id === top.suit).color;
      return top.faceUp && targetColor !== firstColor && top.rank === first.rank + 1;
    }
    if (destination.zone === 'foundation') {
      if (sequence.length !== 1) return false;
      const foundation = foundations[destination.index];
      return first.suit === SUITS[destination.index].id && first.rank === foundation.length + 1;
    }
    return false;
  }

  function removeSequence(source) {
    let sequence;
    if (source.zone === 'waste') sequence = [waste.pop()];
    else if (source.zone === 'foundation') sequence = [foundations[source.index].pop()];
    else sequence = tableau[source.index].splice(source.cardIndex);
    if (source.zone === 'tableau') {
      const pile = tableau[source.index];
      if (pile.length && !pile.at(-1).faceUp) pile.at(-1).faceUp = true;
    }
    return sequence;
  }

  function moveSelected(source, destination) {
    if (!canMove(source, destination)) return false;
    saveUndo();
    startClock();
    const sequence = removeSequence(source);
    if (destination.zone === 'tableau') tableau[destination.index].push(...sequence);
    else foundations[destination.index].push(...sequence);
    moves += 1;
    selection = null;
    render();
    checkWin();
    return true;
  }

  function checkWin() {
    if (foundations.reduce((sum, pile) => sum + pile.length, 0) !== 52) return;
    window.clearInterval(timer);
    timer = null;
    const best = readBest('arcade-best-solitaire');
    if (!best || moves < best) saveBest('arcade-best-solitaire', moves);
    updateStats();
    announce(`Пасьянс собран! ${moves} ходов за ${formatTime(seconds)}. Красиво!`);
  }

  function drawStock() {
    if (!stock.length && !waste.length) {
      announce('Колода и сброс пусты. Перемещай открытые карты.');
      return;
    }
    startClock();
    saveUndo();
    if (stock.length) {
      const card = stock.pop();
      card.faceUp = true;
      waste.push(card);
      moves += 1;
      announce(`Открыта карта: ${cardName(card)}.`);
    } else if (waste.length) {
      stock = waste.reverse().map((card) => ({ ...card, faceUp: false }));
      waste = [];
      moves += 1;
      announce('Сброс возвращён в колоду.');
    } else {
      history.pop();
      announce('Колода и сброс пусты. Перемещай открытые карты.');
      updateStats();
      return;
    }
    selection = null;
    render();
  }

  function selectCard(source) {
    if (!isSelectable(source)) {
      selection = null;
      render();
      return;
    }
    selection = source;
    render();
    const card = getSequence(source)[0];
    announce(`${cardName(card)} выбрана. Нажми на место, куда хочешь её переместить.`);
  }

  function handleCardClick(element) {
    const source = {
      zone: element.dataset.sourceZone,
      index: Number(element.dataset.sourceIndex),
      cardIndex: Number(element.dataset.cardIndex),
    };
    if (!isSelectable(source)) return;
    if (sameSource(selection, source)) {
      selection = null;
      render();
      announce('Выбор снят.');
      return;
    }
    if (selection) {
      const moved = moveSelected(selection, { zone: source.zone, index: source.index });
      if (moved) return;
    }
    selectCard(source);
  }

  board.addEventListener('click', (event) => {
    const stockButton = event.target.closest('[data-stock]');
    if (stockButton) { drawStock(); return; }
    const card = event.target.closest('[data-source-zone]');
    if (card) { handleCardClick(card); return; }
    const destination = event.target.closest('[data-dest-zone]');
    if (destination && selection) {
      const target = { zone: destination.dataset.destZone, index: Number(destination.dataset.destIndex) };
      if (target.zone === 'tableau' || target.zone === 'foundation') {
        if (moveSelected(selection, target)) return;
      }
      selection = null;
      render();
    }
  });

  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-source-zone]');
    if (!card || !card.draggable) { event.preventDefault(); return; }
    selection = { zone: card.dataset.sourceZone, index: Number(card.dataset.sourceIndex), cardIndex: Number(card.dataset.cardIndex) };
    if (!isSelectable(selection)) { event.preventDefault(); return; }
    card.classList.add('is-selected');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'arcade-card');
  });
  board.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-dest-zone]')) event.preventDefault();
  });
  board.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-dest-zone]');
    if (!target || !selection) return;
    event.preventDefault();
    const destination = { zone: target.dataset.destZone, index: Number(target.dataset.destIndex) };
    if (!moveSelected(selection, destination)) { selection = null; render(); }
  });
  board.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-source-zone]');
    if (!card) return;
    const source = { zone: card.dataset.sourceZone, index: Number(card.dataset.sourceIndex), cardIndex: Number(card.dataset.cardIndex) };
    if (!isSelectable(source)) return;
    const topCard = getSequence(source)[0];
    if (topCard) moveSelected(source, { zone: 'foundation', index: SUITS.findIndex((suit) => suit.id === topCard.suit) });
  });

  undoButton.addEventListener('click', () => {
    const previous = history.pop();
    if (!previous) return;
    stock = previous.stock;
    waste = previous.waste;
    foundations = previous.foundations;
    tableau = previous.tableau;
    moves = previous.moves;
    selection = null;
    render();
    announce('Последний ход отменён.');
  });
  reset();

  return {
    restart: reset,
    destroy() {
      disposed = true;
      window.clearInterval(timer);
    },
  };
}
