import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);
await page.evaluate(() => { window.__game.adaptiveQuality = false; window.__game.settings.renderDistance = 6; window.__game.renderDistance = 6; window.__game.renderer.setRenderDistance(6); });
await page.waitForTimeout(3000);
const ok = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  for (let dz=-3; dz<=3; dz++) for (let dx=-3; dx<=3; dx++) w.generateChunk((Math.floor(p.x)>>4)+dx, (Math.floor(p.z)>>4)+dz);
  for (let r = 2; r < 90; r++) for (let a = 0; a < 360; a += 6) {
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const sfc = w.heightAt(x,z);
    for (let y = sfc - 6; y > 8; y--) {
      if (w.getBlock(x,y,z) === 0 && w.getBlock(x,y+1,z) === 0 && w.isSolid(x,y-1,z)) {
        let open = 0;
        for (let dx=-4; dx<=4; dx++) for (let dz=-4; dz<=4; dz++) for (let dy=0; dy<3; dy++) if (w.getBlock(x+dx,y+dy,z+dz) === 0) open++;
        if (open < 55) continue;
        g.player.flying = false;
        g.player.setPosition(x + 0.5, y, z + 0.5);
        g.player.pitch = -0.05;
        g.player.yaw = -Math.PI / 2; // смотрим в +x
        g.timeOfDay = 0.45;
        // факелы прямо в поле зрения
        let placed = 0;
        for (const [dx, dz] of [[2, 1], [4, -1], [7, 2], [3, -3], [9, -2]]) {
          const gx = x + dx, gz = z + dz;
          for (let gy = y + 1; gy > y - 2; gy--) {
            if (w.getBlock(gx, gy, gz) === 0 && w.isSolid(gx, gy - 1, gz)) { w.setBlock(gx, gy, gz, 33); placed++; break; }
          }
        }
        return { x, y, z, placed, open };
      }
    }
  }
  return null;
});
console.log('cave', JSON.stringify(ok));
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/out/final_cave.png' });
await browser.close();
