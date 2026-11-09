import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({
  executablePath: exe,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' },
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(7000);

const diag = await page.evaluate(() => {
  const g = window.__game;
  const r = g.renderer;
  const meshes = [];
  for (const [key, group] of r.chunkObjects) {
    group.children.forEach((m) => {
      const bs = m.geometry.boundingSphere;
      meshes.push({ key, verts: m.geometry.attributes.position.count, tris: m.geometry.index ? m.geometry.index.count/3 : 0, r: bs ? +bs.radius.toFixed(2) : null, pos: m.position.toArray(), mat: m.material === r.materials.solid ? 'solid' : m.material === r.materials.water ? 'water' : m.material === r.materials.cutout ? 'cutout' : 'emissive' });
    });
  }
  return {
    camPos: r.camera.position.toArray().map(v=>+v.toFixed(2)),
    camRot: [r.camera.rotation.x, r.camera.rotation.y].map(v=>+v.toFixed(2)),
    camFar: r.camera.far, camNear: r.camera.near, camFov: r.camera.fov,
    player: g.player.position.toArray().map(v=>+v.toFixed(2)),
    eye: g.player.eyePosition.toArray().map(v=>+v.toFixed(2)),
    chunks: g.world.chunks.size,
    meshCount: meshes.length,
    biggest: meshes.sort((a,b)=>b.verts-a.verts).slice(0,6),
    waterMeshes: meshes.filter(m=>m.mat==='water').length,
    solidMeshes: meshes.filter(m=>m.mat==='solid').length,
    totalVerts: meshes.reduce((a,m)=>a+m.verts,0),
    sceneChildren: r.scene.children.map(o=>o.type),
    skyVisible: r.sky.visible, skyRadius: r.sky.geometry.parameters.radius,
    fog: [r.scene.fog.near, r.scene.fog.far],
  };
});
console.log(JSON.stringify(diag, null, 1));

// Смотрим строго вниз
await page.evaluate(() => { window.__game.player.pitch = -1.2; window.__game.player.yaw = 0.5; });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/diag_down.png' });
// вид на горизонт
await page.evaluate(() => { window.__game.player.pitch = 0; });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/diag_horizon.png' });
// от третьего лица
await page.evaluate(() => { window.__game.player.viewMode = 1; window.__game.player.pitch = -0.25; });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/out/diag_third.png' });
console.log('logs:', logs.slice(-6).join(' | '));
await browser.close();
