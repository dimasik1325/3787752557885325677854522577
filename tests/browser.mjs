import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';

const exe = await chromium.executablePath();
const browser = await pw.launch({
  executablePath: exe,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox'],
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' },
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,5).join('\n')}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const info = await page.evaluate(() => ({
  hasGame: !!window.__game,
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  renderer: (() => { const c = document.getElementById('game'); const gl = c.getContext('webgl2'); if (!gl) return 'none'; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a'; })(),
}));
console.log('INFO', JSON.stringify(info));
console.log('LOGS-1\n' + logs.join('\n'));
await page.screenshot({ path: 'tests/out/browser_start.png' });

await page.click('#start-btn');
await page.waitForTimeout(9000);
const after = await page.evaluate(() => ({
  running: window.__game.running,
  paused: window.__game.paused,
  chunks: window.__game.world.chunks.size,
  meshes: window.__game.renderer.chunkObjects.size,
  pos: window.__game.player.position.toArray().map(v=>+v.toFixed(2)),
  health: window.__game.player.health,
  flying: window.__game.player.flying,
  fps: Math.round(window.__game.fps),
  biome: window.__game.world.generator.columnInfo(Math.floor(window.__game.player.position.x), Math.floor(window.__game.player.position.z)).biome,
  hud: !document.getElementById('hud').classList.contains('hidden'),
  fallbackLook: window.__game.fallbackLook,
  calls: window.__game.renderer.renderer.info.render.calls,
  triangles: window.__game.renderer.renderer.info.render.triangles,
}));
console.log('AFTER', JSON.stringify(after));
await page.screenshot({ path: 'tests/out/browser_game.png' });
console.log('LOGS-2\n' + logs.slice(-20).join('\n'));
await browser.close();
