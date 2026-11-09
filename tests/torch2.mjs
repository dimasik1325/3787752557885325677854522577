import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);
const info = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  for (let r = 2; r < 70; r++) for (let a = 0; a < 360; a += 10) {
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const sfc = w.heightAt(x,z);
    for (let y = sfc - 10; y > 8; y--) {
      if (w.getBlock(x,y,z) === 0 && w.getBlock(x,y+1,z) === 0 && w.isSolid(x,y-1,z)) {
        g.player.flying = false;
        g.player.setPosition(x + 0.5, y, z + 0.5);
        g.player.pitch = -0.9; g.player.yaw = 0.6;
        // выбираем факел
        const torchSlot = g.inventory.slots.findIndex(s => s && s.name === 'torch');
        g.ui.setSelected(torchSlot >= 0 && torchSlot < 9 ? torchSlot : 0);
        g.updateTarget();
        return { x, y, z, torchSlot, selected: g.inventory.selectedItem?.name, target: g.targetHit && {x:g.targetHit.x,y:g.targetHit.y,z:g.targetHit.z,n:g.targetHit.normal}, lightBefore: w.getLight(x, y+1, z) };
      }
    }
  }
  return null;
});
console.log('setup', JSON.stringify(info));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/torch_before.png' });
// ставим 4 факела «как игрок»
const placed = await page.evaluate(() => {
  const g = window.__game;
  const out = [];
  for (let i = 0; i < 4; i++) {
    g.player.yaw = 0.6 + i * 1.5;
    g.player.pitch = -0.75;
    g.updateTarget();
    if (g.targetHit) {
      const before = { ...g.targetHit };
      g.useItem();
      out.push({ hit: [before.x, before.y, before.z], normal: before.normal });
    }
  }
  const p = g.player.position;
  return { out, light: g.world.getLight(Math.floor(p.x), Math.floor(p.y) + 1, Math.floor(p.z)), torchId: 33 };
});
console.log('placed', JSON.stringify(placed));
await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.15; g.player.yaw = 0.6; });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/torch_after.png' });
console.log('errors', errs.length ? errs : 'none');
await browser.close();
