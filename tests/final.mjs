import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push('CONSOLE ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- Креатив ---
await page.click('#mode-select button[data-mode="creative"]');
await page.click('#start-btn');
await page.waitForTimeout(7000);
const creative = await page.evaluate(() => {
  const g = window.__game;
  return { mode: g.mode, flying: g.player.flying, slots: g.inventory.slots.filter(Boolean).length, creative: g.inventory.creative };
});
console.log('CREATIVE', JSON.stringify(creative));

// --- Пещеры: ищем полость под землёй и телепортируемся ---
const caveInfo = await page.evaluate(() => {
  const g = window.__game;
  const world = g.world;
  const p = g.player.position;
  for (let r = 2; r < 60; r++) {
    for (let a = 0; a < 360; a += 12) {
      const x = Math.floor(p.x + Math.cos(a * Math.PI / 180) * r);
      const z = Math.floor(p.z + Math.sin(a * Math.PI / 180) * r);
      if (!world.isGenerated(x, z)) continue;
      const surface = world.heightAt(x, z);
      for (let y = surface - 8; y > 8; y--) {
        if (world.getBlock(x, y, z) === 0 && world.getBlock(x, y + 1, z) === 0 && world.isSolid(x, y - 1, z)) {
          return { x, y, z, surface };
        }
      }
    }
  }
  return null;
});
console.log('CAVE', JSON.stringify(caveInfo));
if (caveInfo) {
  await page.evaluate((c) => {
    const g = window.__game;
    g.player.flying = false;
    g.player.setPosition(c.x + 0.5, c.y, c.z + 0.5);
    g.player.pitch = 0; g.player.yaw = 0.8;
    // поставим светокамни для наглядности
    const ID = 17;
    if (g.world.getBlock(c.x + 2, c.y + 1, c.z) === 0) g.world.setBlock(c.x + 2, c.y + 1, c.z, ID);
    if (g.world.getBlock(c.x - 3, c.y + 1, c.z + 2) === 0) g.world.setBlock(c.x - 3, c.y + 1, c.z + 2, ID);
  }, caveInfo);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/out/cave.png' });
}

// --- Сохранение и загрузка ---
const saveRes = await page.evaluate(() => {
  const g = window.__game;
  g.player.setPosition(g.player.position.x + 12, g.player.position.y + 8, g.player.position.z);
  g.world.setBlock(Math.floor(g.player.position.x), Math.floor(g.player.position.y) + 3, Math.floor(g.player.position.z), 15);
  const ok = g.saveGame(false);
  return { ok, mods: JSON.parse(localStorage.getItem('mcweb.save.v1')).modifications.length, pos: g.player.position.toArray().map(v => +v.toFixed(1)) };
});
console.log('SAVE', JSON.stringify(saveRes));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const continueBtn = await page.evaluate(() => !document.getElementById('continue-btn').classList.contains('hidden'));
await page.click('#continue-btn');
await page.waitForTimeout(7000);
const loaded = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.position;
  const block = g.world.getBlock(Math.floor(p.x), Math.floor(p.y) + 3, Math.floor(p.z));
  return { pos: p.toArray().map(v => +v.toFixed(1)), mods: g.world.modifications.size, restoredBlock: block, mode: g.mode, chunks: g.world.chunks.size };
});
console.log('CONTINUE btn', continueBtn, 'LOADED', JSON.stringify(loaded));
await page.screenshot({ path: 'tests/out/loaded.png' });
console.log('ERRORS', errors.length ? errors.slice(0,5).join(' | ') : 'none');
await browser.close();
