import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(6000);

const step = async (name, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`STEP ${name} threw: ${e.message}`); }
  await page.waitForTimeout(600);
  const ok = errors.length === before;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' -> ' + errors.slice(before).join(' ; ')}`);
};

// 1. Ломание блока: смотрим вниз и держим ЛКМ
await step('сломать блок', async () => {
  await page.evaluate(() => { window.__game.player.pitch = -1.4; window.__game.player.yaw = 0; });
  await page.waitForTimeout(300);
  const res = await page.evaluate(async () => {
    const g = window.__game;
    g.updateTarget();
    const hit = g.targetHit;
    if (!hit) return { err: 'нет цели' };
    const before = g.world.getBlock(hit.x, hit.y, hit.z);
    g.breakBlock(hit, false);
    const after = g.world.getBlock(hit.x, hit.y, hit.z);
    return { before, after, mods: g.world.modifications.size, inv: g.inventory.slots.filter(Boolean).length };
  });
  if (res.err) throw new Error(res.err);
  console.log('     break:', JSON.stringify(res));
});

// 2. Установка блока
await step('поставить блок', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.updateTarget();
    const hit = g.targetHit;
    if (!hit) return { err: 'нет цели' };
    const px = hit.x + hit.normal[0], py = hit.y + hit.normal[1], pz = hit.z + hit.normal[2];
    const selected = g.inventory.selectedBlockId;
    g.useItem();
    return { placed: g.world.getBlock(px, py, pz), expected: selected, py };
  });
  console.log('     place:', JSON.stringify(res));
  if (res.err) throw new Error(res.err);
});

// 3. Инвентарь и крафт
await step('инвентарь + крафт', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.inventory.add('log', 10);
    g.inventory.add('sand', 20);
    const recipes = [...document.querySelectorAll('.recipe')].length;
    g.openInventory();
    const craft = window.__recipeTest = { recipes };
    return { open: g.inventoryOpen, recipes };
  });
  console.log('     inventory:', JSON.stringify(res));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/out/inventory.png' });
  const crafted = await page.evaluate(() => {
    const g = window.__game;
    const before = g.inventory.count('planks');
    const recipe = { id:'p', out:{name:'planks',count:4}, in:[{name:'log',count:1}], label:'Доски' };
    const ok = g.inventory.craft(recipe);
    return { ok, before, after: g.inventory.count('planks') };
  });
  console.log('     craft:', JSON.stringify(crafted));
  await page.evaluate(() => window.__game.closeInventory());
});

// 4. Полёт
await step('полёт', async () => {
  const res = await page.evaluate(async () => {
    const g = window.__game;
    g.player.flying = true;
    const y0 = g.player.position.y;
    await new Promise(r => setTimeout(r, 900));
    return { y0: +y0.toFixed(2), y1: +g.player.position.y.toFixed(2), flying: g.player.flying };
  });
  console.log('     fly:', JSON.stringify(res));
});

// 5. Мобы
await step('мобы', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    const count = g.mobs.mobs.length;
    const m = g.mobs.mobs[0];
    return { count, types: g.mobs.mobs.map(mm => mm.typeName), sample: m ? m.position.toArray().map(v=>+v.toFixed(1)) : null };
  });
  console.log('     mobs:', JSON.stringify(res));
});

// 6. ТНТ
await step('ТНТ', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.player.flying = true;
    const p = g.player.position;
    g.igniteTNT(Math.floor(p.x)+3, Math.floor(p.y)-6, Math.floor(p.z));
    const added = g.tntList.length;
    g.explode(Math.floor(p.x)+3, Math.floor(p.y)-6, Math.floor(p.z));
    return { added, after: g.tntList.length, particles: g.renderer.particleData.filter(x=>x.active).length };
  });
  console.log('     tnt:', JSON.stringify(res));
});

// 7. Сохранение / загрузка
await step('сохранение', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    const ok = g.saveGame(false);
    const raw = localStorage.getItem('mcweb.save.v1');
    const data = JSON.parse(raw);
    return { ok, size: raw.length, mods: data.modifications.length, seed: data.seed, mode: data.mode };
  });
  console.log('     save:', JSON.stringify(res));
});

// 8. Смерть и респавн
await step('смерть и респавн', async () => {
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.player.flying = false;
    g.player.health = 2;
    g.player.invulnerable = 0;
    g.player.damage(10, 'тест');
    return { dead: g.player.dead, health: g.player.health };
  });
  await page.waitForTimeout(900);
  const shown = await page.evaluate(() => !document.getElementById('death-screen').classList.contains('hidden'));
  console.log('     death:', JSON.stringify(res), 'screen:', shown);
  await page.screenshot({ path: 'tests/out/death.png' });
  await page.click('#respawn-btn');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ health: window.__game.player.health, dead: window.__game.player.dead, pos: window.__game.player.position.toArray().map(v=>+v.toFixed(1)) }));
  console.log('     respawn:', JSON.stringify(after));
});

// 9. Пауза / меню / настройки
await step('пауза, настройки, F3', async () => {
  await page.evaluate(() => { window.__game.player.health = 20; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const paused = await page.evaluate(() => window.__game.paused && !document.getElementById('pause-screen').classList.contains('hidden'));
  await page.click('#settings-btn');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.getElementById('rd-input'); i.value = 8; i.dispatchEvent(new Event('input')); const v = document.getElementById('vol-input'); v.value = 30; v.dispatchEvent(new Event('input')); });
  const settings = await page.evaluate(() => ({ rd: window.__game.renderDistance, vol: window.__game.settings.volume, saved: !!localStorage.getItem('mcweb.settings.v1') }));
  await page.screenshot({ path: 'tests/out/settings.png' });
  await page.click('#settings-back');
  await page.waitForTimeout(300);
  await page.click('#resume-btn');
  await page.waitForTimeout(500);
  console.log('     paused:', paused, 'settings:', JSON.stringify(settings), 'resumed:', await page.evaluate(() => !window.__game.paused));
  await page.keyboard.press('F3');
});

// 10. Третье лицо
await step('вид от третьего лица', async () => {
  await page.evaluate(() => { window.__game.player.viewMode = 1; window.__game.player.pitch = -0.2; });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/out/thirdperson.png' });
});

// 11. Ночь + факел? (светокамень)
await step('ночь', async () => {
  await page.evaluate(() => { window.__game.player.viewMode = 0; window.__game.timeOfDay = 0.9; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/out/night_game.png' });
});

const perf = await page.evaluate(() => ({ fps: Math.round(window.__game.fps), chunks: window.__game.world.chunks.size, meshes: window.__game.renderer.chunkObjects.size, calls: window.__game.renderer.renderer.info.render.calls, tris: window.__game.renderer.renderer.info.render.triangles }));
console.log('PERF', JSON.stringify(perf));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
