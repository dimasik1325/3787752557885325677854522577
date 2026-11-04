export function renderStats(target, entries) {
  target.innerHTML = entries.map(([label, value]) => `
    <div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`).join('');
}

export function readBest(key, fallback = 0) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveBest(key, value) {
  try { window.localStorage.setItem(key, String(value)); } catch { /* Private browsing may block storage. */ }
}

export function makeMessage(host, initial = '') {
  const message = document.createElement('p');
  message.className = 'game-message';
  message.setAttribute('aria-live', 'polite');
  message.textContent = initial;
  host.append(message);
  return (text) => { message.textContent = text; };
}

export function makeButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}
