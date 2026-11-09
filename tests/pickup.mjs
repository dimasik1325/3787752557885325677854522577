import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);
const res = await page.evaluate(async () => {
  const g = window.__game;
  g.ui.setSelected(0);
  const before = g.inventory.count('grass');
  g.dropSelectedItem();
  await new Promise(r => setTimeout(r, 1200));
  const drop = g.droppedItems[0];
  const dp = drop.mesh.position.clone();
  // подходим к предмету
  const p = g.player.position;
  g.player.setPosition(dp.x, dp.y + 0.4, dp.z);
  await new Promise(r => setTimeout(r, 1200));
  return { before, left: g.droppedItems.length, after: g.inventory.count('grass'), dropPos: dp.toArray().map(v=>+v.toFixed(1)) };
});
console.log('PICKUP', JSON.stringify(res));
await browser.close();
