// Atlas único de rótulos para TODOS os produtos (dicas 27 e 35: menos texturas e binds).
// Cada produto ocupa uma célula de 512 × 1152 px dividida em regiões fixas. Dois canvases
// compartilham o mesmo layout:
//   cor   → map (sRGB) + alpha para recortes (alphaTest)
//   dados → R = clearcoat, G = roughness, B = metalness (os canais que o three.js lê de
//           clearcoatMap, roughnessMap e metalnessMap) — papel fosco, foil dourado, cápsula

import * as THREE from 'three';

export const CELL = Object.freeze({ w: 512, h: 1152 });
export const REGIONS = Object.freeze({
  main: [0, 0, 512, 512], // rótulo principal
  aux1: [0, 512, 512, 256], // faixa inferior / impressão no vidro / ticket
  aux2: [0, 768, 256, 256], // gargantilha, medalhão, emblema, brasão
  caps: [256, 768, 256, 192], // cápsula do gargalo (envolve 360°)
  solid: [256, 960, 256, 64], // amostras sólidas (topo da tampa)
  tag: [0, 1024, 512, 64], // etiqueta de preço da prateleira
  aux3: [0, 1088, 512, 64], // faixas finas (selo de idade, relevo no vidro)
});
const COLS = 5;
const DATA_SCALE = 2; // o atlas de dados usa metade da resolução: rugosidade/metal não precisam de detalhe fino

// Valores de material por tipo de superfície.
export const SURFACES = Object.freeze({
  papel: { clearcoat: 0, roughness: 0.62, metalness: 0 },
  papelBrilho: { clearcoat: 0.35, roughness: 0.45, metalness: 0 },
  vidroImpresso: { clearcoat: 1, roughness: 0.18, metalness: 0 },
  capsula: { clearcoat: 0.5, roughness: 0.38, metalness: 0 },
  capsulaMetal: { clearcoat: 0.6, roughness: 0.3, metalness: 0.85 },
});
const FOIL = { clearcoat: 0.6, roughness: 0.28, metalness: 1 };

const toByte = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);

// Pixels "dourados" (matiz 28–58°, saturados, nem escuros nem estourados) viram metal;
// papéis creme (claros e pouco saturados) ficam de fora.
function isGold(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const d = max - min;
  if (d < 30 || l < 0.28 || l > 0.86) return false;
  const s = d / (255 - Math.abs(max + min - 255));
  // Papel creme também é "amarelado"; foil é mais saturado quanto mais claro for.
  if (s < 0.47 + Math.max(0, l - 0.6)) return false;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h >= 28 && h <= 58;
}
// Prata/cinza claro de foil (escudo do Chivas).
const isSilver = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 14 && r > 150 && r < 235;

export class LabelAtlas {
  constructor(count) {
    this.rows = Math.ceil(count / COLS);
    this.width = COLS * CELL.w;
    this.height = this.rows * CELL.h;
    this.color = document.createElement('canvas');
    this.color.width = this.width;
    this.color.height = this.height;
    this.data = document.createElement('canvas');
    this.data.width = this.width / DATA_SCALE;
    this.data.height = this.height / DATA_SCALE;
    this.ctx = this.color.getContext('2d', { willReadFrequently: true });
    this.dataCtx = this.data.getContext('2d');
    this.dataCtx.fillStyle = `rgb(0,${toByte(0.6)},0)`;
    this.dataCtx.fillRect(0, 0, this.data.width, this.data.height);
    this.surfaces = []; // [cell, region, surface, foil]
  }

  rect(cell, name) {
    const [x, y, w, h] = REGIONS[name];
    return { x: (cell % COLS) * CELL.w + x, y: Math.floor(cell / COLS) * CELL.h + y, w, h };
  }

  // Converte coordenada local da região (s: 0 esq → 1 dir, t: 0 base → 1 topo) para UV do
  // atlas. CanvasTexture usa flipY, então a linha 0 do canvas fica em v = 1.
  uv(cell, name, s, t) {
    const r = this.rect(cell, name);
    return [(r.x + s * r.w) / this.width, 1 - (r.y + (1 - t) * r.h) / this.height];
  }

  // Desenha numa região em "espaço físico": o template recebe largura × altura na proporção
  // real da peça na garrafa (physW/physH), e o resultado é esticado para caber na região —
  // ao ser aplicado na geometria, a proporção volta ao normal, sem distorcer letras.
  paint(cell, name, physW, physH, draw, { surface = SURFACES.papel, foil = true } = {}) {
    const r = this.rect(cell, name);
    const h = r.h;
    const w = h * (physW / physH);
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    ctx.scale(r.w / w, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    draw(ctx, w, h);
    ctx.restore();
    this.surfaces.push([cell, name, surface, foil]);
  }

  // Amostras sólidas (topo da cápsula): índice 0–3 dentro da região "solid".
  solid(cell, index, color, surface) {
    const r = this.rect(cell, 'solid');
    const x = r.x + index * 64;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, r.y, 64, 64);
    const d = surface;
    this.dataCtx.fillStyle = `rgb(${toByte(d.clearcoat)},${toByte(d.roughness)},${toByte(d.metalness)})`;
    this.dataCtx.fillRect(x / DATA_SCALE, r.y / DATA_SCALE, 64 / DATA_SCALE, 64 / DATA_SCALE);
    return [(x + 32) / this.width, 1 - (r.y + 32) / this.height];
  }

  // Preenche o atlas de dados: valor base por região + foil detectado (amostrando o atlas de
  // cor a cada DATA_SCALE pixels, já que o de dados tem metade da resolução).
  bakeData() {
    const k = DATA_SCALE;
    for (const [cell, name, surf, foil] of this.surfaces) {
      const r = this.rect(cell, name);
      const color = this.ctx.getImageData(r.x, r.y, r.w, r.h);
      const out = this.dataCtx.createImageData(r.w / k, r.h / k);
      const base = [toByte(surf.clearcoat), toByte(surf.roughness), toByte(surf.metalness)];
      const gold = [toByte(FOIL.clearcoat), toByte(FOIL.roughness), toByte(FOIL.metalness)];
      const c = color.data;
      const o = out.data;
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          const i = ((y * k) * r.w + x * k) * 4;
          const metal = foil && c[i + 3] > 127 && (isGold(c[i], c[i + 1], c[i + 2]) || (foil === 'silver' && isSilver(c[i], c[i + 1], c[i + 2])));
          const v = metal ? gold : base;
          const j = (y * out.width + x) * 4;
          o[j] = v[0];
          o[j + 1] = v[1];
          o[j + 2] = v[2];
          o[j + 3] = 255;
        }
      }
      this.dataCtx.putImageData(out, r.x / k, r.y / k);
    }
  }

  textures(maxAnisotropy = 8) {
    this.bakeData();
    const make = (canvas, colorSpace) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = colorSpace;
      t.anisotropy = maxAnisotropy;
      return t;
    };
    return {
      map: make(this.color, THREE.SRGBColorSpace),
      data: make(this.data, THREE.NoColorSpace),
    };
  }
}
