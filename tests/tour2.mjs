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
// дальность побольше для красивых кадров
await page.evaluate(() => { const g = window.__game; g.settings.renderDistance = 9; g.renderDistance = 9; g.renderer.setRenderDistance(9); });
await page.waitForTimeout(9000);

await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.06; g.player.yaw = 0.9; g.timeOfDay = 0.36; });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/out/tour_day.png' });

await page.evaluate(() => { const g = window.__game; g.timeOfDay = 0.755; });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/out/tour_sunset.png' });

await page.evaluate(() => { const g = window.__game; g.timeOfDay = 0.4; g.player.setPosition(g.player.position.x, 88, g.player.position.z); g.player.flying = true; g.player.pitch = -0.42; g.player.yaw = 0.5; });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tests/out/tour_aerial.png' });
console.log('errors', errs.length ? errs : 'none');
await browser.close();
