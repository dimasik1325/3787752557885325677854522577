import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(6000);

// телепорт в пещеру и ставим факелы
const info = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  for (let r = 2; r < 70; r++) for (let a = 0; a < 360; a += 10) {
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const s = w.heightAt(x,z);
    for (let y = s - 10; y > 8; y--) {
      if (w.getBlock(x,y,z) === 0 && w.getBlock(x,y+1,z) === 0 && w.isSolid(x,y-1,z)) {
        g.player.flying = false;
        g.player.setPosition(x + 0.5, y, z + 0.5);
        g.player.pitch = -0.05; g.player.yaw = 0.6;
        // ставим несколько факелов
        const torchId = 33;
        let placed = 0;
        for (const [dx, dz] of [[2, 3], [-4, -2], [6, -5], [-8, 6], [3, -9]]) {
          for (let yy = y + 2; yy > y - 3; yy--) {
            if (w.getBlock(x+dx, yy, z+dz) === 0 && w.isSolid(x+dx, yy-1, z+dz)) {
              w.setBlock(x+dx, yy, z+dz, torchId); placed++; break;
            }
          }
        }
        return { x, y, z, placed, lightHere: w.getLight(x, y+1, z) };
      }
    }
  }
  return null;
});
console.log('cave torches', JSON.stringify(info));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/torch_cave.png' });

// ночь на поверхности с факелом рядом
await page.evaluate(() => {
  const g = window.__game;
  g.timeOfDay = 0.92;
  const p = g.player.position;
  const s = g.world.heightAt(Math.floor(p.x), Math.floor(p.z));
  g.player.setPosition(p.x, s + 1, p.z);
  g.player.pitch = -0.15; g.player.yaw = 0.6;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/night_surface.png' });
console.log('errors', errs.length ? errs : 'none');
await browser.close();
