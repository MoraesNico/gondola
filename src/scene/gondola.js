// Estrutura 3D da gôndola e animação do arranjo.
// Todas as peças possíveis (módulos, colunas, prateleiras de cada produto) são criadas uma vez;
// applyLayout() só move/escala até as posições calculadas por core/layout.js. Assim nada é
// recriado durante o rearranjo e as luzes LED nunca entram ou saem da cena.

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../core/layout.js';
import { box } from './materials.js';
import { createProductBottles } from './bottles.js';
import { makePriceTagTexture, HeaderScreen } from './labels.js';
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
const TRANSITION = 0.95; // s

const lerp = THREE.MathUtils.lerp;

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
    this.led = { on: true, intensity: 9, color: '#ffd7a0' };

    this.root = new THREE.Group();
    this.root.name = 'gondola';
    scene.add(this.root);

    this.elements = new Map(); // chave → { object, x, y, presence, apply }
    this.maxModules = Math.max(1, Math.ceil(catalog.produtos.length / LAYOUT.MAX_SHELVES));

    this.ledMaterial = new THREE.MeshStandardMaterial({ color: '#000000', emissive: this.led.color, emissiveIntensity: 2.2 });
    this.buildShared();
    for (let i = 0; i < this.maxModules; i++) this.buildBay(i);
    for (let k = 0; k <= this.maxModules; k++) this.buildUpright(k);
    this.buildSides();
    this.buildHeaderScreen();
    this.shelves = new Map(catalog.produtos.map((p) => [p.id, this.buildShelf(p)]));
  }

  // ---------- construção ----------

  buildShared() {
    const d = DIM;
    this.geo = {
      panel: box(LAYOUT.MODULE_WIDTH, d.panelTop - d.plinthH, d.panelThick),
      plinth: box(LAYOUT.MODULE_WIDTH, d.plinthH, d.shelfD + 0.04),
      header: box(LAYOUT.MODULE_WIDTH, d.headerH, 0.05),
      upright: box(d.uprightW, d.uprightH, 0.05),
      side: box(d.sideThick, d.uprightH, d.shelfD + 0.06),
      shelf: box(d.shelfW, d.shelfT, d.shelfD),
      // Trilho de preço + 2 mãos-francesas fundidos numa só geometria (1 draw call por prateleira).
      hardware: mergeGeometries([
        box(d.shelfW, 0.04, 0.01).translate(0, -d.shelfT / 2 - 0.004, SHELF_FRONT + 0.005),
        ...[-1, 1].map((s) => box(0.012, 0.07, d.shelfD - 0.06).translate(s * (d.shelfW / 2 - 0.02), -d.shelfT - 0.035, d.backZ + (d.shelfD - 0.06) / 2)),
      ]),
      led: new THREE.BoxGeometry(d.shelfW - 0.06, 0.006, 0.012),
      tag: new THREE.PlaneGeometry(0.17, 0.0213),
    };
  }

  register(key, object, apply) {
    const el = { object, x: 0, y: 0, presence: 0, apply };
    object.visible = false;
    this.elements.set(key, el);
    return el;
  }

  mesh(geometry, material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }

  buildBay(i) {
    const d = DIM;
    const g = new THREE.Group();
    g.name = `modulo-${i}`;
    const panel = this.mesh(this.geo.panel, this.mat.planks, { cast: false });
    panel.position.set(0, d.plinthH + (d.panelTop - d.plinthH) / 2, d.backZ - d.panelThick / 2);
    const plinth = this.mesh(this.geo.plinth, this.mat.metal);
    plinth.position.set(0, d.plinthH / 2, d.backZ + (d.shelfD + 0.04) / 2 - 0.02);
    const header = this.mesh(this.geo.header, this.mat.metal);
    header.position.set(0, HEADER_Y, d.backZ + 0.025);
    g.add(panel, plinth, header);
    this.root.add(g);
    this.register(`bay:${i}`, g, (el) => {
      g.position.x = el.x;
      g.scale.set(Math.max(1e-3, el.presence), 1, 1);
    });
  }

  buildUpright(k) {
    const m = this.mesh(this.geo.upright, this.mat.metal);
    m.name = `coluna-${k}`;
    m.position.set(0, DIM.uprightH / 2, DIM.backZ + 0.025);
    this.root.add(m);
    this.register(`upright:${k}`, m, (el) => {
      m.position.x = el.x;
      m.scale.setScalar(Math.max(1e-3, el.presence));
      m.position.y = (DIM.uprightH / 2) * el.presence; // cresce a partir do piso
    });
  }

  buildSides() {
    for (const side of [-1, 1]) {
      const m = this.mesh(this.geo.side, this.mat.wood);
      m.name = side < 0 ? 'lateral-esquerda' : 'lateral-direita';
      m.position.set(0, DIM.uprightH / 2, DIM.backZ - DIM.panelThick + (DIM.shelfD + 0.06) / 2);
      this.root.add(m);
      this.register(`side:${side}`, m, (el) => {
        m.position.x = el.x;
      });
    }
  }

  buildHeaderScreen() {
    this.screen = new HeaderScreen(this.catalog.expositor);
    const bezel = this.mesh(new THREE.BoxGeometry(0.98, 0.27, 0.012), this.mat.metalBrushed);
    bezel.position.set(0, HEADER_Y, DIM.backZ + 0.056);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.235), screenMat);
    screen.name = 'tela-cabecote';
    screen.position.set(0, HEADER_Y, DIM.backZ + 0.0625);
    this.root.add(bezel, screen);
  }

  buildShelf(produto) {
    const d = DIM;
    const g = new THREE.Group();
    g.name = `prateleira-${produto.id}`;

    const top = this.mesh(this.geo.shelf, this.mat.wood);
    top.position.set(0, -d.shelfT / 2, SHELF_Z);
    const hardware = this.mesh(this.geo.hardware, this.mat.metalBrushed);
    const tagMat = new THREE.MeshStandardMaterial({ map: makePriceTagTexture(produto, this.catalog.expositor.moeda), roughness: 0.5 });
    const tag = this.mesh(this.geo.tag, tagMat, { cast: false });
    tag.position.set(-0.3, -d.shelfT / 2 - 0.004, SHELF_FRONT + 0.0102);

    // Fita LED: faixa emissiva visível + RectAreaLight voltada para baixo, iluminando a
    // prateleira de baixo (luz de área realista; as sombras vêm da luz principal).
    const strip = this.mesh(this.geo.led, this.ledMaterial, { cast: false, receive: false });
    strip.position.set(0, -d.shelfT - 0.004, SHELF_FRONT - 0.03);
    const light = new THREE.RectAreaLight(this.led.color, 0, d.shelfW - 0.06, 0.02);
    light.position.set(0, -d.shelfT - 0.008, SHELF_FRONT - 0.05);
    light.rotation.x = -Math.PI / 2; // emite no -z local → aponta para -y

    const bottles = createProductBottles(produto);
    g.add(top, hardware, tag, strip, light, bottles.group);
    this.root.add(g);

    const shelf = { produto, group: g, light, bottles, pickables: Object.values(bottles.meshes) };
    shelf.el = this.register(`shelf:${produto.id}`, g, (el) => {
      g.position.set(el.x, el.y, 0);
      const s = Math.max(1e-3, el.presence);
      g.scale.set(s, s, s);
      this.applyLed(shelf, el.presence);
    });
    return shelf;
  }

  // ---------- arranjo ----------

  targetsFor(layout) {
    const t = new Map();
    const half = layout.width / 2;
    for (let i = 0; i < this.maxModules; i++) {
      const mod = layout.modules[i];
      t.set(`bay:${i}`, mod ? { x: mod.x, presence: 1 } : { x: this.lastBayX(i, layout), presence: 0 });
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

  lastBayX(i, layout) {
    // Módulo que some recolhe em direção à borda direita da gôndola restante.
    return layout.width / 2 + (i - layout.moduleCount + 0.5) * LAYOUT.MODULE_WIDTH * 0.5;
  }

  applyLayout(layout, { animate = true } = {}) {
    this.current = layout;
    const targets = this.targetsFor(layout);
    this.transition?.cancel();

    const from = new Map();
    for (const [key, el] of this.elements) {
      const to = targets.get(key);
      if (!to) continue;
      if (to.presence > 0) el.object.visible = true;
      // Elemento que nasce agora começa já na posição final (só cresce).
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
      this.renderer.shadowMap.needsUpdate = true; // sombras acompanham o movimento
    };
    const finish = () => {
      for (const el of this.elements.values()) if (el.presence < 1e-3) el.object.visible = false;
      this.screen.draw(this.selectedProduct(), layout.shelves.length);
      this.renderer.shadowMap.needsUpdate = true;
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

  // Chamado pelo loop de render; true enquanto houver animação.
  update(dt) {
    return this.tweener.update(dt);
  }

  // ---------- seleção, LEDs e consultas ----------

  selectedProduct() {
    return this.selected ? this.shelves.get(this.selected)?.produto ?? null : null;
  }

  setSelected(id) {
    if (this.selected) this.shelves.get(this.selected)?.bottles.setHighlight(false);
    this.selected = id && this.shelves.has(id) ? id : null;
    const shelf = this.selected && this.shelves.get(this.selected);
    if (shelf) shelf.bottles.setHighlight(true);
    for (const s of this.shelves.values()) this.applyLed(s, s.el.presence);
    this.screen.draw(this.selectedProduct(), this.current?.shelves.length ?? 0);
    this.requestRender();
  }

  setLed({ on, intensity, color }) {
    Object.assign(this.led, { on, intensity, color });
    this.ledMaterial.emissive.set(color);
    this.ledMaterial.emissiveIntensity = on ? 2.2 : 0;
    for (const s of this.shelves.values()) this.applyLed(s, s.el.presence);
    this.requestRender();
  }

  applyLed(shelf, presence) {
    const boost = shelf.produto.id === this.selected ? 1.7 : 1;
    shelf.light.color.set(this.led.color);
    shelf.light.intensity = this.led.on ? this.led.intensity * presence * boost : 0;
  }

  // Ponto de vista para enquadrar a prateleira de um produto (usa o destino do arranjo).
  focusFor(id) {
    const slot = this.current?.shelves.find((s) => s.productId === id);
    if (!slot) return null;
    const h = this.shelves.get(id).bottles.height;
    const target = new THREE.Vector3(slot.x, slot.y + h * 0.4, 0.02);
    const position = new THREE.Vector3(slot.x + 0.38, slot.y + h * 0.7 + 0.18, 1.75);
    return { target, position };
  }

  pickables() {
    const list = [];
    for (const s of this.shelves.values()) if (s.el.presence > 0.5) list.push(...s.pickables);
    return list;
  }

  get height() {
    return DIM.uprightH;
  }
}
