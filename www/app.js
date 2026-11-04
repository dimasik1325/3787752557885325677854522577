import { mountPacman } from './games/pacman.js';
import { mountSnake } from './games/snake.js';
import { mountSolitaire } from './games/solitaire.js';
import { mountMinesweeper } from './games/minesweeper.js';
import { mountBlockBlast } from './games/blockblast.js';

const catalog = [
  {
    id: 'pacman', title: 'PAC-MAN', icon: '🟡', category: 'АРКАДА',
    description: 'Собирай точки, уворачивайся от привидений и не теряй жизни.',
    cardText: 'Лабиринт, точки и четыре привидения. Сможешь очистить поле?',
    accent: '#ffd84f', background: '#f5e8c7',
    instructions: '<strong>Цель:</strong> собери все точки и постарайся не попасться привидениям. Большие точки дают временную суперсилу.',
    keys: 'Стрелки', mount: mountPacman,
  },
  {
    id: 'snake', title: 'Змейка', icon: '🐍', category: 'АРКАДА',
    description: 'Расти, собирая яблоки. Только не кусай себя за хвост!',
    cardText: 'Собирай яблоки, расти и не врежься в собственный хвост.',
    accent: '#85dfab', background: '#dcefe2',
    instructions: '<strong>Цель:</strong> собирай яблоки и набирай очки. С каждым яблоком змейка становится длиннее и быстрее.',
    keys: 'Стрелки · WASD', mount: mountSnake,
  },
  {
    id: 'solitaire', title: 'Пасьянс', icon: '♠️', category: 'КАРТЫ',
    description: 'Разложи всю колоду по мастям — от туза до короля.',
    cardText: 'Классический «Клондайк»: строй последовательности и освобождай тузы.',
    accent: '#b4a7ff', background: '#e6e2fa',
    instructions: '<strong>Цель:</strong> собери четыре масти от туза до короля. На поле чередуй цвета и раскладывай карты по убыванию.',
    keys: 'Нажми или перетащи карту', mount: mountSolitaire,
  },
  {
    id: 'minesweeper', title: 'Сапёр', icon: '💣', category: 'ЛОГИКА',
    description: 'Открывай клетки, считай подсказки и помечай мины.',
    cardText: 'Логика и немного удачи: найди все безопасные клетки.',
    accent: '#ff9b83', background: '#f7e4dc',
    instructions: '<strong>Цель:</strong> открой все клетки без мин. Число показывает, сколько мин спрятано рядом. Правый клик или режим флажка отмечает мину.',
    keys: 'Клик · правый клик — флаг', mount: mountMinesweeper,
  },
  {
    id: 'blockblast', title: 'Block Blast', icon: '🧱', category: 'ГОЛОВОЛОМКА',
    description: 'Ставь фигуры, собирай линии и освобождай место.',
    cardText: 'Размещай блоки на сетке и очищай полные строки и столбцы.',
    accent: '#8e87ff', background: '#e2e6fa',
    instructions: '<strong>Цель:</strong> размещай фигуры на поле. Полные строки и столбцы исчезают и приносят бонус. Игра заканчивается, если ни одна фигура не помещается.',
    keys: 'Выбери фигуру → нажми на поле', mount: mountBlockBlast,
  },
];

const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
const gameGrid = document.querySelector('#game-grid');
const gameTitle = document.querySelector('#game-title');
const gameKicker = document.querySelector('#game-kicker');
const gameHost = document.querySelector('#game-host');
const gameControls = document.querySelector('#game-controls');
const gameInfo = document.querySelector('#game-info');
const playPanel = document.querySelector('.play-panel');
const restartButton = document.querySelector('#restart-button');
const backButton = document.querySelector('#back-button');
const homeNav = document.querySelector('#home-nav');
const installButton = document.querySelector('#install-button');
let activeGame = null;
let activeModule = null;
let deferredInstallPrompt = null;

const cardMarkup = catalog.map((game, index) => `
  <button class="game-card" type="button" data-open-game="${game.id}"
    style="--card-bg:${game.background};--art-accent:${game.accent}" aria-label="Играть: ${game.title}">
    <span class="game-card-top"><span class="game-number">ИГРА 0${index + 1}</span><span class="game-arrow" aria-hidden="true">↗</span></span>
    <span class="game-art"><span class="game-emoji" aria-hidden="true">${game.icon}</span></span>
    <span class="game-card-copy"><span class="game-card-title">${game.title}</span><span class="game-card-description">${game.cardText}</span><span class="game-card-label">${game.category}</span></span>
  </button>`).join('');
gameGrid.innerHTML = cardMarkup;

function setHomeNav(isHome) {
  homeNav.classList.toggle('is-active', isHome);
  homeNav.setAttribute('aria-current', isHome ? 'page' : 'false');
}

function goHome() {
  if (activeModule?.destroy) activeModule.destroy();
  activeModule = null;
  activeGame = null;
  delete document.body.dataset.game;
  gameHost.replaceChildren();
  gameControls.replaceChildren();
  gameInfo.replaceChildren();
  homeScreen.hidden = false;
  gameScreen.hidden = true;
  setHomeNav(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openGame(id) {
  const game = catalog.find((item) => item.id === id);
  if (!game) return;
  if (activeModule?.destroy) activeModule.destroy();
  activeGame = game;
  document.body.dataset.game = game.id;
  gameTitle.textContent = game.title;
  gameKicker.textContent = `${game.category} · ИГРА 0${catalog.indexOf(game) + 1}`;
  gameHost.replaceChildren();
  gameControls.replaceChildren();
  gameInfo.innerHTML = `
    <p class="info-title">ТВОЯ СТАТИСТИКА</p>
    <div class="stats-grid" id="module-stats"></div>
    <div class="info-divider"></div>
    <p class="info-title">КАК ИГРАТЬ</p>
    <p class="info-copy">${game.instructions}</p>
    <div class="game-shortcut"><span>Управление:</span> <kbd>${game.keys}</kbd></div>`;
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  setHomeNav(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  activeModule = game.mount({
    host: gameHost,
    controls: gameControls,
    stats: gameInfo.querySelector('#module-stats'),
  });
}

gameGrid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-open-game]');
  if (card) openGame(card.dataset.openGame);
});
backButton.addEventListener('click', goHome);
homeNav.addEventListener('click', goHome);
restartButton.addEventListener('click', () => activeModule?.restart?.());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeGame) goHome();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => {
      console.warn('Не удалось включить офлайн-режим:', error);
    });
  });
}
