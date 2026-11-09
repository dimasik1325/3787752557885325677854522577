import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/final_menu.png' });
await page.click('#start-btn');
await page.waitForTimeout(8000);
await page.evaluate(() => { const g = window.__game; g.settings.renderDistance = 8; g.renderDistance = 8; g.renderer.setRenderDistance(8); });
await page.waitForTimeout(9000);

await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.06; g.player.yaw = 0.9; g.timeOfDay = 0.34; });
await page.waitForTimeout(3200);
await page.screenshot({ path: 'tests/out/final_day.png' });

await page.evaluate(() => { const g = window.__game; g.timeOfDay = 0.71; });
await page.waitForTimeout(3200);
await page.screenshot({ path: 'tests/out/final_sunset.png' });

await page.evaluate(() => { const g = window.__game; g.timeOfDay = 0.4; g.player.setPosition(g.player.position.x, 90, g.player.position.z); g.player.flying = true; g.player.pitch = -0.45; g.player.yaw = 0.5; });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tests/out/final_aerial.png' });

// пещера с факелами
await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  for (let r = 2; r < 70; r++) for (let a = 0; a < 360; a += 10) {
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const sfc = w.heightAt(x,z);
    for (let y = sfc - 10; y > 8; y--) {
      if (w.getBlock(x,y,z) === 0 && w.getBlock(x,y+1,z) === 0 && w.isSolid(x,y-1,z) && w.isSolid(x+1,y,z)) {
        g.player.flying = false;
        g.player.setPosition(x + 0.5, y, z + 0.5);
        g.player.pitch = -0.12; g.player.yaw = 1.4;
        g.timeOfDay = 0.4;
        w.setBlock(x + 1, y + 1, z - 2, 33);
        w.setBlock(x - 2, y + 1, z + 2, 33);
        w.setBlock(x + 3, y + 1, z + 3, 33);
        return;
      }
    }
  }
});
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/out/final_cave.png' });

// ночь на поверхности
await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  const sx = Math.floor(p.x), sz = Math.floor(p.z);
  const h = w.heightAt(sx, sz);
  g.player.setPosition(sx + 0.5, h + 1.2, sz + 0.5);
  g.player.pitch = -0.1; g.player.yaw = 0.9;
  g.timeOfDay = 0.92;
  w.setBlock(sx + 2, h + 1, sz - 1, 33);
  w.setBlock(sx - 3, h + 1, sz + 2, 33);
});
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/out/final_night.png' });

// инвентарь и крафт
await page.evaluate(() => { const g = window.__game; g.openInventory(); });
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/out/final_inventory.png' });
await page.click('.inv-tab[data-tab="craft"]');
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/final_craft.png' });
await page.evaluate(() => window.__game.closeInventory());
console.log('errors', errs.length ? errs : 'none');
await browser.close();
