import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await pw.launch({ executablePath: exe, args: [...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'], headless: true, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al/lib:/tmp' } });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(6000);
await page.evaluate(() => { const g = window.__game; g.player.pitch = 0.25; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/sky_all.png' });
// только небо
await page.evaluate(() => { const r = window.__game.renderer; r.clouds.visible = false; });
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/out/sky_noclouds.png' });
// только облака
await page.evaluate(() => { const r = window.__game.renderer; r.clouds.visible = true; r.sky.visible = false; });
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/out/sky_onlyclouds.png' });
const info = await page.evaluate(() => {
  const r = window.__game.renderer;
  return { cloudMat: { transparent: r.cloudMaterial.transparent, opacity: r.cloudMaterial.opacity, map: !!r.cloudMaterial.map, alphaTest: r.cloudMaterial.alphaTest }, skyMat: r.sky.material.type, cloudTexReady: !!r.cloudTex.image };
});
console.log(JSON.stringify(info));
await browser.close();
