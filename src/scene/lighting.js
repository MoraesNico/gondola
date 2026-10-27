// Iluminação física da cena com sombras via shadow map.
// - Luz principal (SpotLight, sombra 2048²): simula o spot de trilho do teto da loja.
// - Preenchimento (DirectionalLight, sombra 1024²): luz geral fria vinda da esquerda.
// - Hemisférica fraca: rebatimento do piso/teto.
// As fitas LED de cada prateleira vivem em gondola.js (RectAreaLight + faixa emissiva).
// Nenhuma luz é adicionada/removida depois de criada: só muda intensidade (sem recompilar shaders).

import * as THREE from 'three';

export const SHADOW_TYPES = { PCF: THREE.PCFShadowMap, VSM: THREE.VSMShadowMap };
export const TONE_MAPPINGS = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

export function createLighting({ scene, renderer }) {
  const params = {
    key: { on: true, intensity: 42, color: '#fff0dc', angle: 36, penumbra: 0.6, x: 1.7, y: 3.3, z: 2.9 },
    fill: { on: true, intensity: 0.7, color: '#d6e2ff' },
    hemi: { intensity: 0.35 },
    led: { on: true, intensity: 9, color: '#ffd7a0' },
    shadows: { enabled: true, type: 'PCF', mapSize: 2048, radius: 4, bias: -0.0004, normalBias: 0.018, helper: false },
    exposure: 1.0,
    toneMapping: 'ACES',
    envIntensity: 0.45,
  };

  const target = new THREE.Object3D();
  target.position.set(0, 1.05, 0);
  scene.add(target);

  const key = new THREE.SpotLight(params.key.color, params.key.intensity);
  key.name = 'luz-principal';
  key.decay = 2;
  key.target = target;
  key.castShadow = true;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 9;
  scene.add(key);

  const fill = new THREE.DirectionalLight(params.fill.color, params.fill.intensity);
  fill.name = 'preenchimento';
  fill.position.set(-3.2, 4.2, 3.4);
  fill.target = target;
  fill.castShadow = true;
  fill.shadow.mapSize.set(1024, 1024);
  Object.assign(fill.shadow.camera, { left: -2.4, right: 2.4, top: 2.8, bottom: -1.6, near: 0.5, far: 12 });
  fill.shadow.bias = -0.0006;
  fill.shadow.normalBias = 0.02;
  scene.add(fill);

  const hemi = new THREE.HemisphereLight('#fff6ea', '#3a2a1e', params.hemi.intensity);
  hemi.name = 'hemisferica';
  scene.add(hemi);

  const shadowHelper = new THREE.CameraHelper(key.shadow.camera); // dica: visualize o frustum da sombra
  shadowHelper.visible = false;
  scene.add(shadowHelper);

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
    if (renderer.shadowMap.type !== type || renderer.shadowMap.enabled !== s.enabled) {
      renderer.shadowMap.type = type;
      renderer.shadowMap.enabled = s.enabled;
      scene.traverse((o) => o.material && ([].concat(o.material).forEach((m) => (m.needsUpdate = true))));
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
    renderer.shadowMap.needsUpdate = true;
  }

  apply();
  return { params, key, fill, hemi, apply };
}
