import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);

// 1) выброс и подбор
const drop = await page.evaluate(async () => {
  const g = window.__game;
  g.player.pitch = -0.1;
  const before = g.inventory.count('grass');
  g.ui.setSelected(0);
  g.dropSelectedItem();
  const mid = g.inventory.count('grass');
  const dropped = g.droppedItems.length;
  // ждём, пока предмет упадёт и вернётся в инвентарь
  g.player.yaw += Math.PI; // отворачиваемся? нет — предмет рядом
  await new Promise(r => setTimeout(r, 2500));
  return { before, mid, dropped, after: g.inventory.count('grass'), left: g.droppedItems.length };
});
console.log('DROP/PICKUP', JSON.stringify(drop));

// 2) установка блока в игрока -> выталкивание вверх
const push = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.position;
  const y0 = p.y;
  // ставим блок в точке, где стоят ноги
  const bx = Math.floor(p.x), by = Math.floor(p.y + 0.6), bz = Math.floor(p.z);
  const ok = g.tryPushPlayerUp(bx, by, bz);
  return { ok, y0: +y0.toFixed(2), y1: +g.player.position.y.toFixed(2) };
});
console.log('PUSH-UP', JSON.stringify(push));

// 3) мировой стриминг при полёте вперёд
const stream = await page.evaluate(async () => {
  const g = window.__game;
  g.player.flying = true;
  const p0 = g.player.position.clone();
  g.keys.KeyW = true;
  g.player.pitch = 0;
  await new Promise(r => setTimeout(r, 6000));
  g.keys.KeyW = false;
  return {
    dist: +g.player.position.distanceTo(p0).toFixed(1),
    chunks: g.world.chunks.size,
    meshes: g.renderer.chunkObjects.size,
    fps: Math.round(g.fps),
    onGround: g.player.onGround,
  };
});
console.log('STREAM', JSON.stringify(stream));
await page.screenshot({ path: 'tests/out/stream.png' });

// 4) мобы: проверка атаки зомби
const zombie = await page.evaluate(async () => {
  const g = window.__game;
  g.player.flying = false;
  const p = g.player.position;
  const z = g.mobs.spawnMob('zombie', p.x + 2.5, p.y + 1, p.z);
  const hp0 = g.player.health;
  await new Promise(r => setTimeout(r, 3000));
  return { spawned: !!z, hp0, hp1: g.player.health, mobs: g.mobs.mobs.length, dead: g.player.dead };
});
console.log('ZOMBIE', JSON.stringify(zombie));
console.log('ERRORS', errs.length ? errs : 'none');
await browser.close();
