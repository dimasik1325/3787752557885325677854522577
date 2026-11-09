import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(8000);
await page.evaluate(() => { const g = window.__game; g.adaptiveQuality = false; g.settings.renderDistance = 8; g.renderDistance = 8; g.renderer.setRenderDistance(8); });
await page.waitForTimeout(10000);

// Пещера с факелами (ставим «руками» на пол)
const cave = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  for (let r = 4; r < 80; r++) for (let a = 0; a < 360; a += 8) {
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const sfc = w.heightAt(x,z);
    for (let y = sfc - 10; y > 8; y--) {
      // ищем полость 3x3x2 со сводом
      let ok = true;
      for (let dx=-2; dx<=2 && ok; dx++) for (let dz=-2; dz<=2 && ok; dz++) {
        if (!w.isSolid(x+dx, y-1, z+dz) || w.getBlock(x+dx, y, z+dz) !== 0 || w.getBlock(x+dx, y+1, z+dz) !== 0) ok = false;
      }
      if (!ok) continue;
      g.player.flying = false;
      g.player.setPosition(x + 0.5, y, z + 0.5);
      g.player.pitch = -0.18; g.player.yaw = 0.7;
      g.timeOfDay = 0.4;
      // факелы по углам
      for (const [dx, dz] of [[1,1],[-1,1],[1,-1],[-1,-1]]) w.setBlock(x+dx, y, z+dz, 33);
      return { x, y, z, light: w.getLight(x, y+1, z) };
    }
  }
  return null;
});
console.log('cave', JSON.stringify(cave));
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/out/final_cave.png' });

// ночь с факелами
await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  const sx = Math.floor(p.x), sz = Math.floor(p.z);
  const h = w.heightAt(sx, sz);
  g.player.setPosition(sx + 0.5, h + 1.2, sz + 0.5);
  g.player.pitch = -0.12; g.player.yaw = 0.9;
  g.timeOfDay = 0.93;
  for (const [dx, dz] of [[2,-1],[-3,2]]) {
    const hh = w.heightAt(sx+dx, sz+dz);
    w.setBlock(sx+dx, hh+1, sz+dz, 33);
  }
});
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/out/final_night.png' });

await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.06; g.player.yaw = 0.9; g.timeOfDay = 0.34; });
await page.waitForTimeout(3200);
await page.screenshot({ path: 'tests/out/final_day.png' });
console.log('errors', errs.length ? errs : 'none');
await browser.close();
