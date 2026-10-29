// Medição de desempenho (dica 94: "check renderer.info regularly").
// Sobe o serve.py, abre a vista geral, força um quadro completo (com passes de sombra e de
// transmissão) e imprime draw calls, triângulos, programas e a memória estimada de texturas.
//
// Uso: node tests/perf.mjs [--port 8770] [--out arquivo.json]
// Requer Playwright (ver tests/smoke.mjs).

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(arg('--port', 8770));
const out = arg('--out', null);
const query = arg('--query', 'quality=high');

const python = process.platform === 'win32' ? 'python' : 'python3';
const server = spawn(python, ['serve.py', '--port', String(port), '--no-browser', '--quiet'], { cwd: root, stdio: 'inherit' });

let browser;
try {
  await sleep(800);
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.setDefaultTimeout(240_000);
  await page.goto(`http://127.0.0.1:${port}/?${query}`);
  await page.waitForFunction(() => window.__gondola?.ready);
  await page.waitForFunction(() => window.__gondola.isIdle(), null, { polling: 500 });

  const stats = await page.evaluate(async () => {
    const { renderer, gondola } = window.__gondola;
    // Quadro completo: força os mapas de sombra a serem refeitos neste quadro.
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.autoUpdate = false;
    window.__gondola.forceShadowUpdate?.();
    gondola.requestRender();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 50));

    const info = renderer.info;
    const scene = window.__gondola.scene ?? gondola.scene;
    // Memória de texturas: soma por Source única (clones compartilham a mesma imagem).
    const sources = new Map();
    const visit = (tex) => {
      if (!tex?.isTexture || sources.has(tex.source.uuid)) return;
      let bytes = 0;
      if (tex.isCompressedTexture && tex.mipmaps?.length) {
        bytes = tex.mipmaps.reduce((s, m) => s + (m.data?.byteLength ?? 0), 0);
      } else {
        const img = tex.image;
        const w = img?.width ?? img?.videoWidth ?? 0;
        const h = img?.height ?? img?.videoHeight ?? 0;
        const bpp = tex.type === 1016 /* HalfFloatType */ ? 8 : 4;
        bytes = w * h * bpp * (tex.generateMipmaps !== false ? 4 / 3 : 1);
      }
      sources.set(tex.source.uuid, { name: tex.name || tex.source.data?.src?.split('/').slice(-2).join('/') || tex.constructor.name, bytes, compressed: Boolean(tex.isCompressedTexture) });
    };
    scene.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) for (const v of Object.values(m)) visit(v);
      if (o.isLight && o.shadow?.map) visit(o.shadow.map.texture);
    });
    if (scene.environment) visit(scene.environment);
    const tex = [...sources.values()];
    const total = tex.reduce((s, t) => s + t.bytes, 0);
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs.length,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      textureMiB: +(total / 2 ** 20).toFixed(1),
      compressedTextures: tex.filter((t) => t.compressed).length,
      lights: (() => { let n = 0; scene.traverse((o) => o.isLight && o.visible && n++); return n; })(),
      pixelRatio: renderer.getPixelRatio(),
    };
  });
  console.log(JSON.stringify(stats, null, 2));
  if (out) await writeFile(out, JSON.stringify(stats, null, 2) + '\n');
} catch (err) {
  console.error('FALHOU:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
