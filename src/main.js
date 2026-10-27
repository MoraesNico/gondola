// Bootstrap: catálogo JSON → arranjo → cena 3D → painel e controles de iluminação.

import * as THREE from 'three';
import { parseCatalog } from './core/catalog.js';
import { createStore } from './state.js';
import { createRenderer } from './scene/renderer.js';
import { createMaterials } from './scene/materials.js';
import { createEnvironment } from './scene/environment.js';
import { createLighting } from './scene/lighting.js';
import { Gondola } from './scene/gondola.js';
import { createPanel } from './ui/panel.js';
import { createLightingGui } from './ui/lightingGui.js';

const $ = (id) => document.getElementById(id);

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

async function main() {
  if (!document.createElement('canvas').getContext('webgl2')) {
    fail('Seu navegador ou placa de vídeo não suporta WebGL2, necessário para a renderização 3D.');
    return;
  }

  const catalog = await loadCatalog();
  const store = createStore(catalog.produtos);

  const canvas = $('scene');
  const view = createRenderer(canvas);
  const { renderer, scene, camera, controls, requestRender } = view;

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    $('loader-progress').value = loaded / total;
    $('loader-text').textContent = `Carregando texturas fotorrealistas… ${loaded}/${total}`;
  };

  const materials = await createMaterials(renderer, manager);
  await createEnvironment({ renderer, scene, materials, manager });
  const lighting = createLighting({ scene, renderer });
  const gondola = new Gondola({ scene, renderer, materials, catalog, requestRender });
  view.addTicker((dt) => gondola.update(dt));
  gondola.setLed(lighting.params.led);
  gondola.applyLayout(store.layout, { animate: false });

  // ---------- câmera ----------
  const overview = (width, smooth) => {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const distV = 1.35 / Math.tan(fov / 2);
    const distH = (width / 2 + 0.35) / (Math.tan(fov / 2) * camera.aspect);
    const d = Math.max(distV, distH) * 1.05;
    const az = THREE.MathUtils.degToRad(9);
    controls.setLookAt(Math.sin(az) * d, 1.35 + d * 0.08, Math.cos(az) * d, 0, 1.12, 0, smooth);
  };
  const focus = (id) => {
    const f = gondola.focusFor(id);
    if (!f) return;
    store.select(id);
    controls.setLookAt(f.position.x, f.position.y, f.position.z, f.target.x, f.target.y, f.target.z, true);
  };
  overview(store.layout.width, false);
  $('reset-view').addEventListener('click', () => {
    store.select(null);
    overview(store.layout.width, true);
  });

  // ---------- interface ----------
  createPanel({ store, catalog, onFocus: focus });
  createLightingGui({ lighting, gondola, container: $('stage'), requestRender });

  let lastWidth = store.layout.width;
  store.on('layout', (layout) => {
    gondola.applyLayout(layout).then(() => {
      if (store.selecionado) focus(store.selecionado);
    });
    if (layout.width !== lastWidth && !store.selecionado) overview(layout.width, true);
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
    return raycaster.intersectObjects(gondola.pickables(), false)[0]?.object.userData.productId ?? null;
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
  renderer.compile(scene, camera);
  requestRender();
  $('loader').classList.add('fade');
  setTimeout(() => ($('loader').hidden = true), 600);
  $('hint').hidden = false;
  setTimeout(() => ($('hint').hidden = true), 6000);

  // Gancho de depuração/testes automatizados (tests/smoke.mjs).
  window.__gondola = { store, gondola, lighting, renderer, isIdle: view.isIdle, ready: true };
}

main().catch((err) => {
  console.error(err);
  fail(err.message || String(err));
});
