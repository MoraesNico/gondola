// Smoke test de navegador (opcional): sobe o serve.py, abre a página no Chromium headless,
// verifica que não há erros de console, exercita o arranjo automático e salva capturas em
// docs/screenshots/. Requer Playwright: `npm i -D playwright && npx playwright install chromium`.
//
// Uso: node tests/smoke.mjs [--port 8765]

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 8765;
const url = `http://127.0.0.1:${port}/`;
const shots = path.join(root, 'docs', 'screenshots');

const python = process.platform === 'win32' ? 'python' : 'python3';
const server = spawn(python, ['serve.py', '--port', String(port), '--no-browser', '--quiet'], { cwd: root, stdio: 'inherit' });

const errors = [];
let browser;
try {
  await sleep(800);
  await mkdir(shots, { recursive: true });
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  // Sem GPU (CI/contêiner) o Chromium renderiza por software e cada quadro pode levar segundos.
  page.setDefaultTimeout(240_000);
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // Espera câmera e animações terminarem (no SwiftShader cada quadro leva segundos).
  const settle = async () => {
    await sleep(500);
    await page.waitForFunction(() => window.__gondola.isIdle(), null, { polling: 500 });
    await sleep(300);
  };

  await page.goto(url);
  await page.waitForFunction(() => window.__gondola?.ready, null, { timeout: 120_000 });
  await settle();

  const state = () => page.evaluate(() => {
    const { store } = window.__gondola;
    return { shelves: store.layout.shelves.length, modules: store.layout.moduleCount };
  });

  const initial = await state();
  console.log('inicial:', initial);
  if (initial.shelves !== 9 || initial.modules !== 2) throw new Error(`esperado 9 prateleiras/2 módulos, obtido ${JSON.stringify(initial)}`);
  await page.screenshot({ path: path.join(shots, '01-vista-geral.png') });

  // US2: seleciona pelo painel
  await page.click('[data-id="macallan-12-double-cask"] .card-head');
  await page.click('[data-id="macallan-12-double-cask"] .btn.primary');
  await settle();
  await page.screenshot({ path: path.join(shots, '02-detalhe-macallan.png') });

  // US3: remove 4 prateleiras → 1 módulo
  for (const id of ['buffalo-trace', 'jameson', 'ballantines-finest', 'glenlivet-caribbean-reserve']) {
    await page.evaluate((pid) => window.__gondola.store.remove(pid), id);
  }
  await page.click('#reset-view');
  await settle();
  const compact = await state();
  console.log('após remover 4:', compact);
  if (compact.shelves !== 5 || compact.modules !== 1) throw new Error(`esperado 5 prateleiras/1 módulo, obtido ${JSON.stringify(compact)}`);
  await page.screenshot({ path: path.join(shots, '03-arranjo-1-modulo.png') });

  // RV-02: não remove a última
  const blocked = await page.evaluate(() => {
    const { store } = window.__gondola;
    for (const id of ['woodford-reserve', 'jack-daniels', 'chivas-regal-12', 'johnnie-walker-black']) store.remove(id);
    return { left: store.layout.shelves.length, refused: store.remove('macallan-12-double-cask') === false };
  });
  console.log('RV-02:', blocked);
  if (blocked.left !== 1 || !blocked.refused) throw new Error('RV-02 falhou');

  await page.evaluate(() => window.__gondola.store.restoreAll());
  await settle();
  if ((await state()).shelves !== 9) throw new Error('restaurar falhou');

  // Iluminação: só LEDs, com fundo escuro, para evidenciar a luz das prateleiras
  await page.evaluate(() => {
    const { lighting, gondola } = window.__gondola;
    lighting.params.key.intensity = 12;
    lighting.params.fill.intensity = 0.15;
    lighting.params.led.intensity = 16;
    lighting.apply();
    gondola.setLed(lighting.params.led);
  });
  await page.click('#reset-view');
  await settle();
  await page.screenshot({ path: path.join(shots, '04-iluminacao-led.png') });

  if (errors.length) throw new Error(`erros no console:\n${errors.join('\n')}`);
  console.log('OK — capturas em docs/screenshots/');
} catch (err) {
  console.error('FALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
