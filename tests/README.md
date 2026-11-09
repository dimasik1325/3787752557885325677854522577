# Тесты и инструменты разработки

Большая часть скриптов запускается в Node без браузера и не требует зависимостей игры.

| Файл | Что делает |
| --- | --- |
| `engine.test.mjs` | генерация, мешер, рейкасты, физика игрока (падение, ходьба, прыжок) |
| `worldscan.mjs` | статистика генерации на разных сидах (руды, деревья, пещеры) |
| `biomes.mjs` | распределение биомов и воды |
| `light.mjs`, `lightperf.mjs` | проверка распространения света и его производительности |
| `profile.mjs` | скорость мешера (мс/чанк) |
| `map.mjs [seed]` | карта мира сверху → `tests/out/map_<seed>.png` |
| `render-atlas.mjs`, `render-icons.mjs` | превью атласа текстур и иконок инвентаря |
| `raster.mjs` | программный растеризатор сцены (без браузера) → PNG |
| `scenes.mjs`, `river.mjs` | рендер разных биомов и реки |
| `canvas-shim.mjs` | мини-Canvas 2D + PNG-энкодер для Node (только для тестов) |
| `browser.mjs`, `interact.mjs`, `final.mjs`, `sky.mjs`, `held.mjs`, `torch.mjs`, `diag.mjs` | браузерные тесты (Playwright + Chromium) |
| `water.mjs`, `biomes.mjs` | проверки воды/биомов |

Браузерные тесты ждут открытый dev-сервер на `http://localhost:5173`:

```bash
npm run dev &
node tests/interact.mjs
```
