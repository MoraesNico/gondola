// Painel de iluminação (lil-gui): ajusta luzes, LEDs, sombras e exposição em tempo real.

import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { SHADOW_TYPES, TONE_MAPPINGS } from '../scene/lighting.js';

export function createLightingGui({ lighting, gondola, view, container, requestRender }) {
  const p = lighting.params;
  const gui = new GUI({ title: 'Iluminação', container, width: 280 });
  gui.domElement.classList.add('lighting-gui');
  const apply = () => {
    lighting.apply();
    requestRender();
  };
  const led = () => {
    gondola.setLed(p.led);
    lighting.invalidateShadows();
  };

  const key = gui.addFolder('Luz principal (spot)');
  key.add(p.key, 'on').name('Ligada').onChange(apply);
  key.add(p.key, 'intensity', 0, 150, 1).name('Intensidade (cd)').onChange(apply);
  key.addColor(p.key, 'color').name('Cor').onChange(apply);
  key.add(p.key, 'angle', 10, 70, 1).name('Abertura (°)').onChange(apply);
  key.add(p.key, 'penumbra', 0, 1, 0.01).name('Penumbra').onChange(apply);
  key.add(p.key, 'x', -4, 4, 0.05).name('Posição X').onChange(apply);
  key.add(p.key, 'y', 1.5, 4, 0.05).name('Posição Y').onChange(apply);
  key.add(p.key, 'z', 0.5, 5, 0.05).name('Posição Z').onChange(apply);

  const fill = gui.addFolder('Preenchimento').close();
  fill.add(p.fill, 'on').name('Ligada').onChange(apply);
  fill.add(p.fill, 'intensity', 0, 4, 0.05).name('Intensidade (lx)').onChange(apply);
  fill.addColor(p.fill, 'color').name('Cor').onChange(apply);
  fill.add(p.fill, 'shadow').name('Projeta sombra (+1 passe)').onChange(apply);
  fill.add(p.hemi, 'intensity', 0, 2, 0.05).name('Hemisférica').onChange(apply);

  const leds = gui.addFolder('Fitas LED das prateleiras');
  leds.add(p.led, 'on').name('Ligadas').onChange(led);
  leds.add(p.led, 'mode', { 'Assado (lightmap, rápido)': 'assado', 'Realista (10 RectAreaLight)': 'realista' }).name('Modo').onChange(led);
  leds.add(p.led, 'intensity', 0, 30, 0.5).name('Intensidade (nit)').onChange(led);
  leds.addColor(p.led, 'color').name('Cor (temperatura)').onChange(led);

  const sh = gui.addFolder('Sombras (shadow map)').close();
  sh.add(p.shadows, 'enabled').name('Ativas').onChange(apply);
  sh.add(p.shadows, 'type', Object.keys(SHADOW_TYPES)).name('Tipo').onChange(apply);
  sh.add(p.shadows, 'mapSize', [512, 1024, 2048, 4096]).name('Resolução').onChange(apply).listen();
  sh.add(p.shadows, 'radius', 0, 12, 0.5).name('Suavidade').onChange(apply);
  sh.add(p.shadows, 'bias', -0.003, 0.001, 0.0001).name('Bias').onChange(apply);
  sh.add(p.shadows, 'normalBias', 0, 0.06, 0.001).name('Normal bias').onChange(apply);
  sh.add(p.shadows, 'helper').name('Ver frustum da sombra').onChange(apply);

  const img = gui.addFolder('Imagem').close();
  img.add(p, 'exposure', 0.2, 2.5, 0.01).name('Exposição').onChange(apply);
  img.add(p, 'toneMapping', Object.keys(TONE_MAPPINGS)).name('Tone mapping').onChange(apply);
  img.add(p, 'envIntensity', 0, 2, 0.01).name('Reflexos HDRI').onChange(apply);
  const q = { nivel: '' };
  const qc = img.add(q, 'nivel').name('Qualidade (auto)').disable();
  view.onTier((t) => qc.setValue(`${t.id}${view.qualityLocked ? ' · fixa' : ''}`));

  gui.close(); // começa recolhido para não cobrir a vitrine
  return gui;
}
