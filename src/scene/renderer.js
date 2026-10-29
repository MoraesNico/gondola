// Renderer, câmera, controles e loop de quadros.
// - Renderiza sob demanda: só desenha quando a câmera se moveu, há animação ou alguém chamou
//   requestRender() (dica 64).
// - Qualidade adaptativa (dicas 68/80): mede o tempo de quadro enquanto anima e ajusta pixel
//   ratio, sombra e resolução da transmissão (src/core/quality.js).
// - Perda de contexto WebGL tratada (dica 98).

import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { QUALITY_TIERS, createQualityController } from '../core/quality.js';

CameraControls.install({ THREE });

export function createRenderer(canvas, { quality = null, onContextLost = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true, // MSAA nativo (sem pós-processamento)
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap foi removido no r186
  renderer.shadowMap.autoUpdate = true; // quem decide é cada luz (shadow.autoUpdate = false)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a120c');

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
  camera.position.set(1.2, 1.5, 4.2);

  const controls = new CameraControls(camera, canvas);
  controls.smoothTime = 0.35;
  controls.draggingSmoothTime = 0.12;
  controls.dollyToCursor = true;
  controls.minDistance = 0.45;
  controls.maxDistance = 7.5;
  controls.minPolarAngle = THREE.MathUtils.degToRad(25);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(92); // nunca abaixo do piso
  controls.minAzimuthAngle = THREE.MathUtils.degToRad(-75); // a gôndola está encostada na parede
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(75);
  controls.setBoundary(new THREE.Box3(new THREE.Vector3(-2.2, 0.15, -0.3), new THREE.Vector3(2.2, 2.4, 1.2)));

  const timer = new THREE.Timer();
  timer.connect(document); // pausa o delta quando a aba fica oculta
  const tickers = new Set();
  const tierListeners = new Set();
  let dirty = true;
  let idle = false;
  let lastFrameMs = 0;

  const requestRender = () => (dirty = true);
  controls.addEventListener('update', requestRender);

  // ---------- qualidade ----------
  const qc = createQualityController({ start: quality ?? 'alta', locked: Boolean(quality) });
  function applyTier(tier) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatio));
    renderer.transmissionResolutionScale = tier.transmissionScale; // vidro fino: meia resolução basta
    resize();
    tierListeners.forEach((fn) => fn(tier));
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  applyTier(qc.tier);

  // ---------- loop ----------
  let running = true;
  function frame(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    let animating = controls.update(dt);
    for (const tick of tickers) animating = tick(dt) || animating;
    if (animating || dirty) {
      const t0 = performance.now();
      renderer.render(scene, camera);
      lastFrameMs = performance.now() - t0;
      dirty = false;
      // Só quadros em sequência (animação/câmera) dizem algo sobre o desempenho.
      if (animating) {
        const changed = qc.sample(timer.getDelta() * 1000 || lastFrameMs);
        if (changed) applyTier(qc.tier);
      }
    }
    idle = !animating;
  }
  renderer.setAnimationLoop(frame);

  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault(); // permite a restauração
    running = false;
    renderer.setAnimationLoop(null);
    onContextLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // Recarregar é o caminho mais seguro: texturas comprimidas e canvases precisam ser reenviados.
    if (!running) window.location.reload();
  });

  return {
    renderer,
    scene,
    camera,
    controls,
    requestRender,
    // tick(dt) => boolean (true enquanto houver animação)
    addTicker: (fn) => tickers.add(fn),
    onTier: (fn) => (tierListeners.add(fn), fn(qc.tier)),
    get tier() { return qc.tier; },
    get qualityLocked() { return qc.locked; },
    get lastFrameMs() { return lastFrameMs; },
    // true quando câmera e animações pararam (usado pelos testes)
    isIdle: () => idle && !dirty,
    tiers: QUALITY_TIERS,
  };
}
