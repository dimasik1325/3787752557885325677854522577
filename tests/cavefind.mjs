import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);
await page.evaluate(() => { window.__game.adaptiveQuality = false; });
const found = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = g.player.position;
  // гарантированно генерируем область вокруг
  for (let dz=-3; dz<=3; dz++) for (let dx=-3; dx<=3; dx++) w.generateChunk((Math.floor(p.x)>>4)+dx, (Math.floor(p.z)>>4)+dz);
  const hits = [];
  for (let r = 2; r < 90; r++) for (let a = 0; a < 360; a += 6) {
    if (hits.length > 3) break;
    const x = Math.floor(p.x + Math.cos(a*Math.PI/180)*r), z = Math.floor(p.z + Math.sin(a*Math.PI/180)*r);
    if (!w.isGenerated(x,z)) continue;
    const sfc = w.heightAt(x,z);
    for (let y = sfc - 6; y > 8; y--) {
      if (w.getBlock(x,y,z) === 0 && w.getBlock(x,y+1,z) === 0 && w.getBlock(x,y+2,z) === 0 && w.isSolid(x,y-1,z)) {
        // насколько «открыто» вокруг
        let open = 0;
        for (let dx=-3; dx<=3; dx++) for (let dz=-3; dz<=3; dz++) for (let dy=0; dy<3; dy++) if (w.getBlock(x+dx,y+dy,z+dz) === 0) open++;
        hits.push({ x, y, z, sfc, open });
        break;
      }
    }
  }
  return { player: p.toArray().map(v=>+v.toFixed(1)), hits: hits.sort((a,b)=>b.open-a.open) };
});
console.log(JSON.stringify(found, null, 1));
if (found.hits.length) {
  const c = found.hits[0];
  await page.evaluate((c) => {
    const g = window.__game, w = g.world;
    g.player.flying = false;
    g.player.setPosition(c.x + 0.5, c.y, c.z + 0.5);
    g.player.pitch = -0.12; g.player.yaw = 0.9;
    g.timeOfDay = 0.42;
    for (const [dx, dz] of [[1,1],[-2,1],[1,-2]]) {
      if (w.getBlock(c.x+dx, c.y, c.z+dz) === 0 && w.isSolid(c.x+dx, c.y-1, c.z+dz)) w.setBlock(c.x+dx, c.y, c.z+dz, 33);
    }
  }, c);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/out/final_cave.png' });
}
await browser.close();
