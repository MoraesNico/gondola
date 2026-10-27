// Renderer, câmera, controles e loop de quadros.
// Renderiza sob demanda (dica "renderize só quando algo muda"): o loop só desenha quando a
// câmera se moveu, há animação ativa ou alguém chamou requestRender().

import * as THREE from 'three';
import CameraControls from 'camera-controls';

CameraControls.install({ THREE });

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true, // MSAA nativo é mais barato que AA em pós-processamento (dicas)
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap foi removido no r186
  renderer.shadowMap.autoUpdate = false; // atualizado só quando a cena muda
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#17120e');

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
  let dirty = true;
  let idle = false;

  const requestRender = () => (dirty = true);
  controls.addEventListener('update', requestRender);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    let animating = controls.update(dt);
    for (const tick of tickers) animating = tick(dt) || animating;
    if (animating || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    idle = !animating;
  });

  return {
    renderer,
    scene,
    camera,
    controls,
    requestRender,
    // tick(dt) => boolean (true enquanto houver animação)
    addTicker: (fn) => tickers.add(fn),
    // true quando câmera e animações pararam (usado pelo smoke test)
    isIdle: () => idle && !dirty,
  };
}
