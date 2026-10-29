// Tela interativa do cabeçote: um canvas reaproveitado, redesenhado a cada seleção, na mesma
// linguagem country sóbria do painel — carvão e verde-floresta, filete duplo de latão, serifa
// clássica no nome e números em slab.

import * as THREE from 'three';
import { formatPrice } from '../core/catalog.js';

const CHARCOAL = '#1f1c19';
const FOREST = '#2f4a3a';
const LINEN = '#efe7d8';
const BRASS = '#c9a46a';
const MUTED = 'rgba(239,231,216,0.68)';
const F = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: '"Libre Franklin", Arial, sans-serif',
  slab: '"Zilla Slab", Georgia, serif',
};

function tracked(ctx, s, x, y, spacing) {
  let px = x;
  for (const ch of s) {
    ctx.fillText(ch, px, y);
    px += ctx.measureText(ch).width + spacing;
  }
}

export class HeaderScreen {
  constructor(expositor) {
    this.expositor = expositor;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.draw(null, 0);
  }

  draw(produto, shelfCount) {
    const { ctx } = this;
    const W = 1024;
    const H = 256;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, CHARCOAL);
    g.addColorStop(1, '#27302a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // filete duplo de latão
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.lineWidth = 1;
    ctx.strokeRect(22, 22, W - 44, H - 44);

    if (!produto) {
      ctx.fillStyle = BRASS;
      ctx.font = `600 20px ${F.sans}`;
      tracked(ctx, (this.expositor.categoria || 'Whisky').toUpperCase(), 60, 64, 4);
      ctx.fillStyle = LINEN;
      ctx.font = `600 80px ${F.serif}`;
      ctx.fillText(this.expositor.nome, 58, 132);
      ctx.fillStyle = MUTED;
      ctx.font = `500 22px ${F.sans}`;
      tracked(ctx, `${shelfCount} RÓTULOS NA GÔNDOLA  ·  TOQUE NUMA GARRAFA PARA CONHECER`, 60, 200, 2);
    } else {
      ctx.fillStyle = produto.rotulo.destaque;
      ctx.fillRect(22, 22, 10, H - 44);
      ctx.fillStyle = BRASS;
      ctx.font = `600 19px ${F.sans}`;
      tracked(ctx, `${produto.tipo} · ${produto.pais}`.toUpperCase(), 60, 58, 3);
      ctx.fillStyle = LINEN;
      let size = 72;
      do ctx.font = `600 ${size}px ${F.serif}`; while (ctx.measureText(produto.nome).width > 600 && (size -= 2) > 34);
      ctx.fillText(produto.nome, 58, 118);
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 26px ${F.serif}`;
      ctx.fillText(`Notas de ${produto.notas.slice(0, 3).join(', ')}`, 60, 170);
      if (produto.harmonizacao.length) ctx.fillText(`Acompanha ${produto.harmonizacao.slice(0, 2).join(' e ')}`, 60, 204);
      // preço à direita, separado por filete vertical
      ctx.fillStyle = BRASS;
      ctx.fillRect(W - 300, 50, 1, H - 100);
      ctx.textAlign = 'center';
      ctx.fillStyle = LINEN;
      ctx.font = `600 54px ${F.slab}`;
      ctx.fillText(formatPrice(produto.preco, this.expositor.moeda), W - 160, 112);
      ctx.fillStyle = BRASS;
      ctx.font = `600 18px ${F.sans}`;
      ctx.fillText(`${produto.volumeMl ?? ''} ML  ·  ${produto.teorAlcoolico}% VOL`, W - 160, 162);
      ctx.fillStyle = FOREST;
      ctx.fillRect(W - 250, 186, 180, 2);
    }
    this.texture.needsUpdate = true;
  }
}
