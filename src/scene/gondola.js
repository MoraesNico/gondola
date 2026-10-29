// Estrutura 3D da gôndola e animação do arranjo.
// Orçamento de draw calls (dica 30): peças repetidas viram InstancedMesh (tampos, ferragens,
// fitas LED, colunas, laterais) e todas as garrafas ficam em dois BatchedMesh (bottles.js).
// Nada é criado ou destruído durante o rearranjo: applyLayout() só anima matrizes.
//
// LEDs (dicas 53 e 55): por padrão a luz das fitas é "assada" — lightmap com gradiente nos
// tampos e faixas de retroiluminação no painel de fundo, redesenhadas a cada quadro do rearranjo —
// em vez de 10 RectAreaLight avaliadas em todo pixel de todo material. O modo "realista"
// religa as RectAreaLight (troca rara, recompila os shaders uma vez).

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../core/layout.js';
import { box } from './materials.js';
import { createBottleSystem } from './bottles.js';
import { HeaderScreen } from './screen.js';
import { Tweener } from './tween.js';

export const DIM = Object.freeze({
  backZ: -0.2, // face frontal do painel de fundo
  panelThick: 0.018,
  plinthH: 0.12,
  panelTop: 2.1,
  headerH: 0.3,
  uprightW: 0.035,
  uprightH: 2.42,
  sideThick: 0.022,
  shelfW: LAYOUT.MODULE_WIDTH - 0.04,
  shelfD: 0.38,
  shelfT: 0.022,
});
const SHELF_Z = DIM.backZ + DIM.shelfD / 2;
const SHELF_FRONT = DIM.backZ + DIM.shelfD;
const HEADER_Y = DIM.panelTop + DIM.headerH / 2;
const PANEL_H = DIM.panelTop - DIM.plinthH;
const PANEL_Y = DIM.plinthH + PANEL_H / 2;
const LED_DROP = 0.03; // m — a fita fica logo abaixo do tampo
const TRANSITION = 0.95; // s
export const LIGHTMAP_SCALE = 0.2; // intensidade do LED (nit) → lightMapIntensity dos tampos
export const BACKLIGHT_SCALE = 0.09; // intensidade do LED → emissiveIntensity do fundo

const lerp = THREE.MathUtils.lerp;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function instanced(geometry, material, count, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geometry, material, count);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.frustumCulled = false; // instâncias se movem; a gôndola está sempre em quadro
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < count; i++) m.setMatrixAt(i, _m.makeScale(0, 0, 0));
  return m;
}

function glowCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx: c.getContext('2d'), tex };
}

export class Gondola {
  constructor({ scene, renderer, materials, catalog, requestRender }) {
    RectAreaLightUniformsLib.init();
    this.scene = scene;
    this.renderer = renderer;
    this.mat = materials;
    this.catalog = catalog;
    this.requestRender = requestRender;
    this.tweener = new Tweener();
    this.current = null;
    this.transition = null;
    this.selected = null;
    this.led = { on: true, intensity: 9, color: '#ffc68c', mode: 'assado' };
    this.onShadowsDirty = () => {};

    this.root = new THREE.Group();
    this.root.name = 'gondola';
    scene.add(this.root);

    this.elements = new Map(); // chave → { x, y, presence, apply }
    this.produtos = catalog.produtos;
    this.maxModules = Math.max(1, Math.ceil(this.produtos.length / LAYOUT.MAX_SHELVES));

    this.buildBays();
    this.buildUprightsAndSides();
    this.buildShelves();
    this.buildHeaderScreen();
  }

  // ---------- construção ----------

  register(key, apply) {
    const el = { x: 0, y: 0, presence: 0, apply };
    this.elements.set(key, el);
    return el;
  }

  buildBays() {
    const d = DIM;
    // plinto + cabeçote fundidos: um draw call de metal por módulo (dica 34)
    const metalGeo = mergeGeometries([
      box(LAYOUT.MODULE_WIDTH, d.plinthH, d.shelfD + 0.04).translate(0, d.plinthH / 2, d.backZ + (d.shelfD + 0.04) / 2 - 0.02),
      box(LAYOUT.MODULE_WIDTH, d.headerH, 0.05).translate(0, HEADER_Y, d.backZ + 0.025),
    ]);
    const panelGeo = box(LAYOUT.MODULE_WIDTH, PANEL_H, d.panelThick).translate(0, PANEL_Y, d.backZ - d.panelThick / 2);
    this.bays = [];
    for (let i = 0; i < this.maxModules; i++) {
      const g = new THREE.Group();
      g.name = `modulo-${i}`;
      g.visible = false;
      const metal = new THREE.Mesh(metalGeo, this.mat.metal);
      metal.castShadow = true;
      metal.receiveShadow = true;
      // Retroiluminação: faixas âmbar no fundo ripado atrás de cada prateleira, como nas
      // gôndolas de destilados. Num painel quase preto um lightmap não aparece, então a faixa é
      // emissiva — e é ela que o vidro transmissivo "enxerga", fazendo o whisky brilhar.
      const glow = glowCanvas(16, 256);
      glow.tex.repeat.set(1 / LAYOUT.MODULE_WIDTH, 1 / PANEL_H);
      glow.tex.offset.set(0.5, 0.5); // UVs em metros, centradas no painel
      const panelMat = this.mat.planks.clone();
      panelMat.emissive.set('#ffffff');
      panelMat.emissiveMap = glow.tex;
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.receiveShadow = true; // nada atrás dele: não precisa projetar sombra
      g.add(metal, panel);
      this.root.add(g);
      const bay = { group: g, glow, material: panelMat };
      this.bays.push(bay);
      bay.el = this.register(`bay:${i}`, (el) => {
        g.visible = el.presence > 1e-3;
        g.position.x = el.x;
        g.scale.set(Math.max(1e-3, el.presence), 1, 1);
      });
    }
  }

  buildUprightsAndSides() {
    const n = this.maxModules + 1;
    this.uprights = instanced(box(DIM.uprightW, DIM.uprightH, 0.05), this.mat.metal, n);
    this.uprights.name = 'colunas';
    for (let k = 0; k < n; k++) {
      this.register(`upright:${k}`, (el) => {
        const s = Math.max(1e-3, el.presence);
        _m.compose(_p.set(el.x, (DIM.uprightH / 2) * el.presence, DIM.backZ + 0.025), _q.identity(), _s.set(s, s, s));
        this.uprights.setMatrixAt(k, el.presence > 1e-3 ? _m : _m.makeScale(0, 0, 0));
      });
    }
    this.sides = instanced(box(DIM.sideThick, DIM.uprightH, DIM.shelfD + 0.06), this.mat.wood, 2);
    this.sides.name = 'laterais';
    [-1, 1].forEach((side, i) => {
      this.register(`side:${side}`, (el) => {
        this.sides.setMatrixAt(i, _m.makeTranslation(el.x, DIM.uprightH / 2, DIM.backZ - DIM.panelThick + (DIM.shelfD + 0.06) / 2));
      });
    });
    this.root.add(this.uprights, this.sides);
  }

  buildShelves() {
    const d = DIM;
    const n = this.produtos.length;

    // Tampo com lightmap compartilhado: mais claro na frente (sob a fita LED de cima).
    this.topGlow = glowCanvas(128, 64);
    this.topGlow.tex.repeat.set(1 / d.shelfW, 1 / d.shelfD);
    this.topGlow.tex.offset.set(0.5, 0.5);
    this.topMaterial = this.mat.wood.clone();
    this.topMaterial.lightMap = this.topGlow.tex;

    this.tops = instanced(box(d.shelfW, d.shelfT, d.shelfD).translate(0, -d.shelfT / 2, SHELF_Z), this.topMaterial, n);
    this.tops.name = 'tampos';
    this.hardware = instanced(
      mergeGeometries([
        box(d.shelfW, 0.04, 0.01).translate(0, -d.shelfT / 2 - 0.004, SHELF_FRONT + 0.005), // trilho de preço
        ...[-1, 1].map((s) => box(0.012, 0.05, d.shelfD - 0.06).translate(s * (d.shelfW / 2 - 0.02), -d.shelfT - 0.025, d.backZ + (d.shelfD - 0.06) / 2)),
      ]),
      this.mat.metalBrushed,
      n,
    );
    this.hardware.name = 'ferragens';
    this.ledMaterial = new THREE.MeshStandardMaterial({ color: '#000000', emissive: this.led.color, emissiveIntensity: 2.4 });
    this.strips = instanced(new THREE.BoxGeometry(d.shelfW - 0.06, 0.006, 0.012).translate(0, -d.shelfT - 0.004, SHELF_FRONT - 0.03), this.ledMaterial, n, { cast: false, receive: false });
    this.strips.name = 'fitas-led';

    this.bottles = createBottleSystem(this.produtos, {
      moeda: this.catalog.expositor.moeda,
      tagPosition: new THREE.Vector3(-0.3, -d.shelfT / 2 - 0.004, SHELF_FRONT + 0.0102),
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
    });

    // RectAreaLight só no modo "realista" (invisíveis não entram no shader).
    this.areaLights = this.produtos.map(() => {
      const l = new THREE.RectAreaLight(this.led.color, 0, d.shelfW - 0.06, 0.02);
      l.rotation.x = -Math.PI / 2; // emite no −z local → aponta para baixo
      l.visible = false;
      this.root.add(l);
      return l;
    });

    this.root.add(this.tops, this.hardware, this.strips, ...this.bottles.meshes);

    this.shelves = new Map();
    this.produtos.forEach((produto, i) => {
      const shelf = { produto, index: i };
      shelf.el = this.register(`shelf:${produto.id}`, (el) => {
        const visible = el.presence > 1e-3;
        const s = Math.max(1e-3, el.presence);
        _m.compose(_p.set(el.x, el.y, 0), _q.identity(), _s.set(s, s, s));
        for (const mesh of [this.tops, this.hardware, this.strips]) mesh.setMatrixAt(i, visible ? _m : _m.clone().makeScale(0, 0, 0));
        this.bottles.setShelf(produto.id, _m, visible);
        const light = this.areaLights[i];
        light.position.set(el.x, el.y - d.shelfT - 0.008, SHELF_FRONT - 0.05);
        this.applyLed(shelf, el.presence);
      });
      this.shelves.set(produto.id, shelf);
    });
  }

  buildHeaderScreen() {
    this.screen = new HeaderScreen(this.catalog.expositor);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.27, 0.012), this.mat.metalBrushed);
    bezel.position.set(0, HEADER_Y, DIM.backZ + 0.056);
    bezel.castShadow = true;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.235), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    screen.name = 'tela-cabecote';
    screen.position.set(0, HEADER_Y, DIM.backZ + 0.0625);
    for (const m of [bezel, screen]) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    }
    this.root.add(bezel, screen);
  }

  // ---------- LEDs assados ----------

  drawTopGlow() {
    const { ctx, canvas, tex } = this.topGlow;
    const { width: w, height: h } = canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); // linha 0 = frente do tampo
    g.addColorStop(0, this.led.color);
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = this.led.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    const edge = ctx.createLinearGradient(0, 0, w, 0); // cai nas pontas da fita
    edge.addColorStop(0, 'rgba(0,0,0,0.85)');
    edge.addColorStop(0.08, 'rgba(0,0,0,0)');
    edge.addColorStop(0.92, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    tex.needsUpdate = true;
  }

  // Faixas de luz no fundo ripado logo abaixo de cada fita (posição atual das prateleiras).
  drawPanelGlow() {
    const shelves = [...this.shelves.values()].map((s) => s.el).filter((el) => el.presence > 1e-3);
    for (const bay of this.bays) {
      if (!bay.group.visible) continue;
      const { ctx, canvas, tex } = bay.glow;
      const { width: w, height: h } = canvas;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const el of shelves) {
        const weight = Math.max(0, 1 - Math.abs(el.x - bay.el.x) / (LAYOUT.MODULE_WIDTH / 2)) * el.presence;
        if (weight <= 0) continue;
        const yLed = el.y - LED_DROP;
        const py = ((DIM.panelTop - yLed) / PANEL_H) * h; // canvas: linha 0 = topo do painel
        const band = (0.34 / PANEL_H) * h; // cobre a altura das garrafas da prateleira de baixo
        const g = ctx.createLinearGradient(0, py - band * 0.1, 0, py + band);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.06, this.led.color);
        g.addColorStop(0.7, 'rgba(200,110,40,0.7)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = weight;
        ctx.fillStyle = g;
        ctx.fillRect(0, py - band * 0.1, w, band * 1.1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      tex.needsUpdate = true;
    }
  }

  // ---------- arranjo ----------

  targetsFor(layout) {
    const t = new Map();
    const half = layout.width / 2;
    for (let i = 0; i < this.maxModules; i++) {
      const mod = layout.modules[i];
      t.set(`bay:${i}`, mod ? { x: mod.x, presence: 1 } : { x: half + (i - layout.moduleCount + 0.5) * LAYOUT.MODULE_WIDTH * 0.5, presence: 0 });
    }
    for (let k = 0; k <= this.maxModules; k++) {
      const on = k <= layout.moduleCount;
      t.set(`upright:${k}`, { x: on ? -half + k * LAYOUT.MODULE_WIDTH : half, presence: on ? 1 : 0 });
    }
    const sideX = half + DIM.uprightW / 2 + DIM.sideThick / 2;
    t.set('side:-1', { x: -sideX, presence: 1 });
    t.set('side:1', { x: sideX, presence: 1 });
    for (const [id, shelf] of this.shelves) {
      const slot = layout.shelves.find((s) => s.productId === id);
      // Prateleira que sai encolhe onde está; a que entra cresce já no destino.
      t.set(`shelf:${id}`, slot ? { x: slot.x, y: slot.y, presence: 1 } : { x: shelf.el.x, y: shelf.el.y, presence: 0 });
    }
    return t;
  }

  applyLayout(layout, { animate = true } = {}) {
    this.current = layout;
    const targets = this.targetsFor(layout);
    this.transition?.cancel();

    const from = new Map();
    for (const [key, el] of this.elements) {
      const to = targets.get(key);
      if (el.presence === 0 && to.presence > 0) {
        el.x = to.x;
        el.y = to.y ?? el.y;
      }
      from.set(key, { x: el.x, y: el.y, presence: el.presence });
    }

    const step = (k) => {
      for (const [key, a] of from) {
        const el = this.elements.get(key);
        const b = targets.get(key);
        el.x = lerp(a.x, b.x, k);
        el.y = lerp(a.y, b.y ?? a.y, k);
        el.presence = lerp(a.presence, b.presence, k);
        el.apply(el);
      }
      for (const m of [this.tops, this.hardware, this.strips, this.uprights, this.sides]) m.instanceMatrix.needsUpdate = true;
      this.drawPanelGlow();
      this.onShadowsDirty(); // sombras acompanham o movimento
    };
    const finish = () => {
      this.screen.draw(this.selectedProduct(), layout.shelves.length);
      this.onShadowsDirty();
      this.requestRender();
    };

    if (!animate) {
      step(1);
      finish();
      return Promise.resolve(true);
    }
    this.transition = this.tweener.run(TRANSITION, step);
    this.transition.then((done) => done && finish());
    this.requestRender();
    return this.transition;
  }

  update(dt) {
    return this.tweener.update(dt);
  }

  // ---------- seleção, LEDs e consultas ----------

  selectedProduct() {
    return this.selected ? this.shelves.get(this.selected)?.produto ?? null : null;
  }

  setSelected(id) {
    if (this.selected) this.bottles.setHighlight(this.selected, false);
    this.selected = id && this.shelves.has(id) ? id : null;
    if (this.selected) this.bottles.setHighlight(this.selected, true);
    for (const s of this.shelves.values()) this.applyLed(s, s.el.presence);
    this.screen.draw(this.selectedProduct(), this.current?.shelves.length ?? 0);
    this.requestRender();
  }

  setLed({ on, intensity, color, mode = this.led.mode }) {
    const modeChanged = mode !== this.led.mode;
    Object.assign(this.led, { on, intensity, color, mode });
    this.ledMaterial.emissive.set(color);
    this.ledMaterial.emissiveIntensity = on ? 2.4 : 0;
    const baked = on && mode === 'assado' ? intensity * LIGHTMAP_SCALE : 0;
    this.topMaterial.lightMapIntensity = baked;
    // retroiluminação acompanha os LEDs nos dois modos
    for (const bay of this.bays) bay.material.emissiveIntensity = on ? intensity * BACKLIGHT_SCALE : 0;
    if (modeChanged) for (const l of this.areaLights) l.visible = mode === 'realista';
    this.drawTopGlow();
    this.drawPanelGlow();
    for (const s of this.shelves.values()) this.applyLed(s, s.el.presence);
    this.requestRender();
  }

  applyLed(shelf, presence) {
    const light = this.areaLights[shelf.index];
    const boost = shelf.produto.id === this.selected ? 1.7 : 1;
    light.color.set(this.led.color);
    light.intensity = this.led.on ? this.led.intensity * presence * boost : 0;
  }

  focusFor(id) {
    const slot = this.current?.shelves.find((s) => s.productId === id);
    if (!slot) return null;
    const h = this.bottles.heightOf(id);
    const target = new THREE.Vector3(slot.x, slot.y + h * 0.4, 0.02);
    const position = new THREE.Vector3(slot.x + 0.38, slot.y + h * 0.7 + 0.18, 1.75);
    return { target, position };
  }

  pick(raycaster) {
    for (const hit of raycaster.intersectObjects(this.bottles.meshes, false)) {
      const id = this.bottles.productAt(hit);
      if (id && this.shelves.get(id).el.presence > 0.5) return id;
    }
    return null;
  }

  get width() {
    return this.current?.width ?? LAYOUT.MODULE_WIDTH;
  }
}
