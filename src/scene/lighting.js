// Iluminação quente de adega (≈ 2700–3000 K) com sombras via shadow map.
// - Luz principal (SpotLight, sombra 2048²): spot de trilho do teto, âmbar suave.
// - Preenchimento (DirectionalLight): luz geral quente vinda da esquerda; SEM sombra por padrão
//   (dica 53/58: cada luz com sombra é um passe inteiro a mais) — pode ser ligada no painel.
// - Hemisférica: rebatimento quente do piso de mármore e do teto.
// As fitas LED de cada prateleira vivem em gondola.js (lightmaps assados ou RectAreaLight).
// Sombras atualizam só quando algo muda (dica 61: shadow.autoUpdate = false por luz).

import * as THREE from 'three';

export const SHADOW_TYPES = { PCF: THREE.PCFShadowMap, VSM: THREE.VSMShadowMap };
export const TONE_MAPPINGS = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

export function createLighting({ scene, renderer }) {
  const params = {
    key: { on: true, intensity: 46, color: '#ffd2a1', angle: 34, penumbra: 0.65, x: 1.5, y: 3.3, z: 2.8 }, // ~2900 K
    fill: { on: true, intensity: 0.55, color: '#ffe3c4', shadow: false }, // ~3500 K
    hemi: { intensity: 0.32, sky: '#ffe9d2', ground: '#5a3a22' },
    led: { on: true, intensity: 9, color: '#ffc68c', mode: 'assado' }, // ~2900 K
    shadows: { enabled: true, type: 'PCF', mapSize: 2048, radius: 4, bias: -0.0004, normalBias: 0.018, helper: false },
    exposure: 1.05,
    toneMapping: 'ACES',
    envIntensity: 0.32,
  };

  const target = new THREE.Object3D();
  target.position.set(0, 1.05, 0);
  scene.add(target);

  const key = new THREE.SpotLight(params.key.color, params.key.intensity);
  key.name = 'luz-principal';
  key.decay = 2;
  key.target = target;
  key.castShadow = true;
  key.shadow.autoUpdate = false;
  key.shadow.camera.near = 2; // frustum justo (dica 60): a luz está a ~4 m da gôndola
  key.shadow.camera.far = 7;
  scene.add(key);

  const fill = new THREE.DirectionalLight(params.fill.color, params.fill.intensity);
  fill.name = 'preenchimento';
  fill.position.set(-3.2, 4.2, 3.4);
  fill.target = target;
  fill.shadow.autoUpdate = false;
  fill.shadow.mapSize.set(1024, 1024);
  fill.shadow.bias = -0.0006;
  fill.shadow.normalBias = 0.02;
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(params.hemi.sky, params.hemi.ground, params.hemi.intensity);
  hemi.name = 'hemisferica';
  scene.add(hemi);

  const shadowHelper = new THREE.CameraHelper(key.shadow.camera); // dica: visualize o frustum da sombra
  shadowHelper.visible = false;
  scene.add(shadowHelper);

  // Pede um novo mapa de sombra às luzes que projetam (chamado em rearranjo/ajuste de luz).
  function invalidateShadows() {
    key.shadow.needsUpdate = true;
    fill.shadow.needsUpdate = true;
  }

  // Ajusta o frustum ortográfico do preenchimento à largura atual da gôndola.
  function fitToWidth(width) {
    const half = width / 2 + 0.6;
    Object.assign(fill.shadow.camera, { left: -half, right: half, top: 2.8, bottom: -1.4 });
    fill.shadow.camera.updateProjectionMatrix();
    invalidateShadows();
  }

  function apply() {
    const k = params.key;
    key.intensity = k.on ? k.intensity : 0;
    key.color.set(k.color);
    key.angle = THREE.MathUtils.degToRad(k.angle);
    key.penumbra = k.penumbra;
    key.position.set(k.x, k.y, k.z);

    fill.intensity = params.fill.on ? params.fill.intensity : 0;
    fill.color.set(params.fill.color);
    hemi.intensity = params.hemi.intensity;

    const s = params.shadows;
    const type = SHADOW_TYPES[s.type];
    const fillShadow = s.enabled && params.fill.shadow;
    if (renderer.shadowMap.type !== type || renderer.shadowMap.enabled !== s.enabled || fill.castShadow !== fillShadow) {
      renderer.shadowMap.type = type;
      renderer.shadowMap.enabled = s.enabled;
      fill.castShadow = fillShadow;
      scene.traverse((o) => o.material && [].concat(o.material).forEach((m) => (m.needsUpdate = true)));
    }
    if (key.shadow.mapSize.x !== s.mapSize) {
      key.shadow.mapSize.set(s.mapSize, s.mapSize);
      key.shadow.map?.dispose();
      key.shadow.map = null; // recriado no próximo render com o novo tamanho
    }
    key.shadow.radius = s.radius;
    fill.shadow.radius = s.radius;
    key.shadow.bias = s.bias;
    key.shadow.normalBias = s.normalBias;
    if (s.type === 'VSM') key.shadow.blurSamples = 12;

    key.updateMatrixWorld();
    key.shadow.camera.updateProjectionMatrix();
    shadowHelper.visible = s.helper;
    shadowHelper.update();

    renderer.toneMappingExposure = params.exposure;
    renderer.toneMapping = TONE_MAPPINGS[params.toneMapping];
    scene.environmentIntensity = params.envIntensity;
    invalidateShadows();
  }

  apply();
  return { params, key, fill, hemi, apply, invalidateShadows, fitToWidth };
}
