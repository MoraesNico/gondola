// Bootstrap: catálogo JSON → arranjo → cena 3D → painel e controles de iluminação.
// Parâmetros de URL: ?perf (painel de desempenho), ?quality=low|medium|high (fixa o nível),
// ?textures=jpg (sem KTX2), ?lineup (as 10 garrafas lado a lado, para comparar com as fotos).

import * as THREE from 'three';
import { parseCatalog } from './core/catalog.js';
import { parseQualityParam } from './core/quality.js';
import { createStore } from './state.js';
import { createRenderer } from './scene/renderer.js';
import { createMaterials } from './scene/materials.js';
import { createEnvironment, loadEnvironmentMap } from './scene/environment.js';
import { createLighting } from './scene/lighting.js';
import { Gondola } from './scene/gondola.js';
import { LABEL_FONTS } from './scene/labelArt.js';
import { createPerfHud } from './scene/perfHud.js';
import { createPanel } from './ui/panel.js';
import { createLightingGui } from './ui/lightingGui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

function fail(message) {
  $('loader').hidden = true;
  $('error').hidden = false;
  $('error-text').textContent = message;
}

async function loadCatalog() {
  let res;
  try {
    res = await fetch('data/whiskies.json', { cache: 'no-store' });
  } catch {
    throw new Error('Não foi possível ler data/whiskies.json. A página precisa ser aberta por um servidor HTTP.');
  }
  if (!res.ok) throw new Error(`data/whiskies.json respondeu HTTP ${res.status}.`);
  let raw;
  try {
    raw = await res.json();
  } catch (err) {
    throw new Error(`data/whiskies.json não é um JSON válido: ${err.message}`);
  }
  const catalog = parseCatalog(raw);
  if (catalog.invalidos.length) console.warn('[catálogo] itens ignorados:', catalog.invalidos);
  return catalog;
}

// Os rótulos são desenhados em canvas: as fontes precisam estar prontas antes.
async function loadFonts() {
  try {
    await Promise.all(LABEL_FONTS.map((f) => document.fonts.load(f, f.includes('Yuji') ? '響ウイスキー' : 'Aa')));
  } catch (err) {
    console.warn('[fontes] usando fontes do sistema nos rótulos', err);
  }
}

const progress = (text, value) => {
  $('loader-text').textContent = text;
  if (value != null) $('loader-progress').value = value;
};

async function main() {
  if (!document.createElement('canvas').getContext('webgl2')) {
    fail('Seu navegador ou placa de vídeo não suporta WebGL2, necessário para a renderização 3D.');
    return;
  }

  const [catalog] = await Promise.all([loadCatalog(), loadFonts()]);
  const store = createStore(catalog.produtos);
  const lineup = params.has('lineup');

  const canvas = $('scene');
  const view = createRenderer(canvas, {
    quality: parseQualityParam(window.location.search),
    onContextLost: () => fail('A placa de vídeo reiniciou o contexto 3D. A página será recarregada assim que ele voltar.'),
  });
  const { renderer, scene, camera, controls, requestRender } = view;

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => progress(`Carregando texturas comprimidas… ${loaded}/${total}`, (loaded / total) * 0.8);

  const [materials, envMap] = await Promise.all([
    createMaterials(renderer, manager, { preferKtx2: params.get('textures') !== 'jpg' }),
    loadEnvironmentMap(renderer, manager),
  ]);
  createEnvironment({ scene, materials, envMap });
  progress('Desenhando rótulos…', 0.85);
  const lighting = createLighting({ scene, renderer });
  const gondola = new Gondola({ scene, renderer, materials, catalog, requestRender });
  gondola.onShadowsDirty = lighting.invalidateShadows;
  view.addTicker((dt) => gondola.update(dt));
  gondola.setLed(lighting.params.led);
  view.onTier((tier) => {
    lighting.params.shadows.mapSize = tier.shadowMapSize;
    lighting.apply();
  });

  // ---------- câmera ----------
  const fit = (halfW, halfH) => {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return Math.max(halfH / t, halfW / (t * camera.aspect));
  };
  const overview = (width, smooth) => {
    const d = fit(width / 2 + 0.35, 1.35) * 1.05;
    const az = THREE.MathUtils.degToRad(9);
    controls.setLookAt(Math.sin(az) * d, 1.35 + d * 0.08, Math.cos(az) * d, 0, 1.12, 0, smooth);
  };
  const focus = (id) => {
    const f = gondola.focusFor(id);
    if (!f) return;
    store.select(id);
    controls.setLookAt(f.position.x, f.position.y, f.position.z, f.target.x, f.target.y, f.target.z, true);
  };

  if (lineup) {
    setupLineup({ gondola, catalog, materials, scene, controls, fit });
  } else {
    gondola.applyLayout(store.layout, { animate: false });
    lighting.fitToWidth(store.layout.width);
    overview(store.layout.width, false);
  }
  $('reset-view').addEventListener('click', () => {
    store.select(null);
    overview(store.layout.width, true);
  });

  // ---------- interface ----------
  createPanel({ store, catalog, onFocus: focus });
  createLightingGui({ lighting, gondola, view, container: $('stage'), requestRender });
  if (params.has('perf')) {
    const tex = gondola.bottles.textures;
    createPerfHud(view, { textures: () => (materials.textures.wood.map?.isCompressedTexture ? 'KTX2' : 'JPG') + (tex ? ' + ATLAS' : '') });
  }

  let lastWidth = store.layout.width;
  store.on('layout', (layout) => {
    gondola.applyLayout(layout).then(() => {
      if (store.selecionado) focus(store.selecionado);
    });
    if (layout.width !== lastWidth) {
      lighting.fitToWidth(layout.width);
      if (!store.selecionado) overview(layout.width, true);
    }
    lastWidth = layout.width;
  });
  store.on('select', (id) => gondola.setSelected(id));

  // ---------- seleção por clique na garrafa ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return gondola.pick(raycaster);
  };
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const id = pick(ev);
    if (id) focus(id);
  });
  let hoverQueued = false;
  canvas.addEventListener('pointermove', (ev) => {
    if (hoverQueued || ev.buttons) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      canvas.classList.toggle('hovering', Boolean(pick(ev)));
      hoverQueued = false;
    });
  });

  // ---------- pronto ----------
  // Compila todos os shaders com o carregamento ainda na tela (dica 5): sem travadas depois.
  progress('Preparando shaders…', 0.95);
  await renderer.compileAsync(scene, camera);
  requestRender();
  $('loader').classList.add('fade');
  setTimeout(() => ($('loader').hidden = true), 600);
  if (!lineup) {
    $('hint').hidden = false;
    setTimeout(() => ($('hint').hidden = true), 6000);
  }

  // Gancho de depuração/testes automatizados (tests/smoke.mjs, tests/perf.mjs).
  window.__gondola = {
    store, gondola, lighting, renderer, scene, camera,
    isIdle: view.isIdle,
    forceShadowUpdate: lighting.invalidateShadows,
    ready: true,
  };
}

// Vista de comparação: uma garrafa de cada produto sobre um tampo, de frente para a câmera.
function setupLineup({ gondola, catalog, materials, scene, controls, fit }) {
  document.body.classList.add('panel-closed', 'lineup');
  for (const child of gondola.root.children) child.visible = gondola.bottles.meshes.includes(child);
  const n = catalog.produtos.length;
  const step = 0.145;
  const y = 0.92;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(n * step + 0.12, 0.04, 0.24), materials.wood);
  stand.position.set(0, y - 0.02, 0);
  stand.receiveShadow = true;
  scene.add(stand);
  const m = new THREE.Matrix4();
  catalog.produtos.forEach((p, i) => gondola.bottles.setSingle(p.id, m.makeTranslation((i - (n - 1) / 2) * step, y, 0)));
  const d = fit((n * step) / 2 + 0.06, 0.2) * 1.04;
  controls.setLookAt(0, y + 0.16, d, 0, y + 0.15, 0, false);
}

main().catch((err) => {
  console.error(err);
  fail(err.message || String(err));
});
