import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
const shot = async (name) => page.screenshot({ path: `tests/out/tour_${name}.png` });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot('menu');

await page.click('#start-btn');
await page.waitForTimeout(9000);
await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.05; g.player.yaw = 0.9; g.timeOfDay = 0.36; });
await page.waitForTimeout(2500);
await shot('day');

// удар/анимация руки с блоком
await page.evaluate(() => { window.__game.renderer.swingTimer = 0.8; });
await page.waitForTimeout(250);
await shot('swing');

// инвентарь: вкладка крафта
await page.evaluate(() => { const g = window.__game; g.inventory.add('log', 24); g.inventory.add('sand', 30); g.inventory.add('wool_white', 8); g.openInventory(); });
await page.waitForTimeout(500);
await page.click('.inv-tab[data-tab="craft"]');
await page.waitForTimeout(700);
await shot('craft');
// креатив-вкладка
await page.click('.inv-tab[data-tab="creative"]');
await page.waitForTimeout(700);
await shot('creative');
await page.evaluate(() => window.__game.closeInventory());
await page.waitForTimeout(600);

// вечер
await page.evaluate(() => { const g = window.__game; g.timeOfDay = 0.745; g.player.pitch = 0.02; g.player.yaw = 0.9; });
await page.waitForTimeout(2500);
await shot('sunset');

// ночь + факел рядом с игроком
await page.evaluate(() => {
  const g = window.__game;
  g.timeOfDay = 0.93;
  const p = g.player.position;
  const x = Math.floor(p.x) + 2, z = Math.floor(p.z) - 2;
  const h = g.world.heightAt(x, z);
  g.world.setBlock(x, h + 1, z, 33);
  g.player.pitch = -0.25;
});
await page.waitForTimeout(3000);
await shot('night');

// под водой
await page.evaluate(() => {
  const g = window.__game;
  const gen = g.world.generator;
  let spot = null;
  for (let a = 0; a < 360 && !spot; a += 10) {
    const x = Math.round(Math.cos(a*Math.PI/180)*30), z = Math.round(Math.sin(a*Math.PI/180)*30);
    const i = gen.columnInfo(x, z);
    if (i.height < 55) spot = { x, z, h: i.height };
  }
  g.timeOfDay = 0.35;
  if (spot) { g.player.setPosition(spot.x, spot.h + 3, spot.z); g.player.flying = true; g.player.pitch = -0.2; g.player.yaw = 1.2; }
});
await page.waitForTimeout(3000);
await shot('underwater');

// полёт высоко над миром
await page.evaluate(() => {
  const g = window.__game;
  g.timeOfDay = 0.38;
  g.player.setPosition(g.player.position.x, 110, g.player.position.z);
  g.player.flying = true;
  g.player.pitch = -0.55; g.player.yaw = 0.4;
});
await page.waitForTimeout(4000);
await shot('aerial');

console.log('errors', errs.length ? errs : 'none');
await browser.close();
