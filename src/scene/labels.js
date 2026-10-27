// Texturas geradas em canvas a partir do JSON: rótulo da garrafa, etiqueta de preço da
// prateleira e a tela interativa do cabeçote. Só texto — nenhum logotipo é reproduzido.

import * as THREE from 'three';
import { formatPrice } from '../core/catalog.js';

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { anisotropy = 4 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// Quebra o texto em até `maxLines` linhas que caibam em `maxWidth`.
function wrap(ctx, text, maxWidth, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function fitFont(ctx, lines, family, weight, maxSize, maxWidth) {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
    size -= 2;
  } while (size > 12);
  return size;
}

// Ruído leve de papel para o rótulo não parecer plástico.
function paperGrain(ctx, w, h, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.025 + rand() * 0.03})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.restore();
}

const hash = (str) => [...str].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) || 1;

export function makeLabelTexture(produto) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const g = produto.garrafa;
  const tilt = THREE.MathUtils.degToRad(g.inclinacaoRotulo || 0);

  ctx.save();
  if (tilt) {
    // Rótulo inclinado (ex.: Johnnie Walker, 24°): fundo transparente + alphaTest no material.
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-tilt);
    ctx.translate(-S / 2, -S / 2);
  }
  const inset = tilt ? 70 : 0;
  const x0 = inset;
  const y0 = inset;
  const w = S - inset * 2;
  const h = S - inset * 2;

  ctx.fillStyle = g.corRotulo;
  ctx.fillRect(x0, y0, w, h);
  paperGrain(ctx, S, S, hash(produto.id));

  // molduras
  ctx.strokeStyle = g.corTextoRotulo;
  ctx.lineWidth = 6;
  ctx.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 30, y0 + 30, w - 60, h - 60);

  ctx.fillStyle = g.corTextoRotulo;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = x0 + w / 2;
  const maxW = w - 90;

  ctx.font = `600 22px ${SANS}`;
  ctx.fillText((produto.pais || '').toUpperCase(), cx, y0 + 70);

  ctx.font = `700 76px ${SERIF}`;
  const nameLines = wrap(ctx, produto.nome, maxW, 3);
  const size = fitFont(ctx, nameLines, SERIF, 700, nameLines.length > 2 ? 62 : 76, maxW);
  const blockH = nameLines.length * size * 1.05;
  nameLines.forEach((l, i) => ctx.fillText(l, cx, y0 + h * 0.44 - blockH / 2 + size * 0.55 + i * size * 1.05));

  ctx.fillRect(cx - 60, y0 + h * 0.66, 120, 3);
  ctx.font = `italic 26px ${SERIF}`;
  wrap(ctx, produto.tipo || '', maxW, 2).forEach((l, i) => ctx.fillText(l, cx, y0 + h * 0.73 + i * 30));

  ctx.font = `600 22px ${SANS}`;
  const footer = [produto.idade && !/sem idade/i.test(produto.idade) ? produto.idade.toUpperCase() : null,
    produto.volumeMl ? `${produto.volumeMl} ML` : null, `${produto.teorAlcoolico}% VOL`].filter(Boolean).join('  ·  ');
  ctx.fillText(footer, cx, y0 + h - 62);
  ctx.restore();

  return toTexture(c, { anisotropy: 8 });
}

export function makePriceTagTexture(produto, moeda) {
  const [c, ctx] = canvas(512, 64);
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = produto.garrafa.corLiquido;
  ctx.fillRect(0, 0, 10, 64);
  ctx.fillStyle = '#1c1612';
  ctx.textBaseline = 'middle';
  ctx.font = `700 26px ${SANS}`;
  const nome = produto.nome.length > 26 ? `${produto.nome.slice(0, 25)}…` : produto.nome;
  ctx.fillText(nome, 24, 24);
  ctx.font = `500 17px ${SANS}`;
  ctx.fillStyle = '#5b5046';
  ctx.fillText(`${produto.volumeMl ?? ''} ml · ${produto.teorAlcoolico}%`, 24, 48);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8c1d18';
  ctx.font = `800 34px ${SANS}`;
  ctx.fillText(formatPrice(produto.preco, moeda), 500, 33);
  return toTexture(c, { anisotropy: 8 });
}

// Tela do cabeçote: um canvas reaproveitado e redesenhado a cada seleção.
export class HeaderScreen {
  constructor(expositor) {
    this.expositor = expositor;
    [this.canvas, this.ctx] = canvas(1024, 256);
    this.texture = toTexture(this.canvas);
    this.draw(null, 0);
  }

  draw(produto, shelfCount) {
    const { ctx } = this;
    const W = 1024;
    const H = 256;
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#120d0a');
    grad.addColorStop(1, '#2b1d12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    if (!produto) {
      ctx.fillStyle = '#d9a35b';
      ctx.font = `600 22px ${SANS}`;
      ctx.fillText((this.expositor.categoria || 'WHISKY').toUpperCase(), 48, 58);
      ctx.fillStyle = '#f3ece2';
      ctx.font = `700 64px ${SERIF}`;
      ctx.fillText(this.expositor.nome, 48, 128);
      ctx.fillStyle = '#b5a796';
      ctx.font = `400 26px ${SANS}`;
      ctx.fillText(`${shelfCount} rótulos na gôndola · toque numa garrafa para conhecer`, 48, 198);
    } else {
      const g = produto.garrafa;
      ctx.fillStyle = g.corLiquido;
      ctx.fillRect(0, 0, 14, H);
      ctx.fillStyle = '#d9a35b';
      ctx.font = `600 22px ${SANS}`;
      ctx.fillText(`${produto.tipo} · ${produto.pais}`.toUpperCase(), 48, 50);
      ctx.fillStyle = '#f3ece2';
      let size = 58;
      do ctx.font = `700 ${size}px ${SERIF}`; while (ctx.measureText(produto.nome).width > 640 && (size -= 2) > 30);
      ctx.fillText(produto.nome, 48, 112);
      ctx.fillStyle = '#b5a796';
      ctx.font = `400 24px ${SANS}`;
      const harm = produto.harmonizacao.slice(0, 2).join(', ');
      ctx.fillText(`Notas: ${produto.notas.slice(0, 3).join(', ')}`, 48, 170);
      if (harm) ctx.fillText(`Harmoniza com: ${harm}`, 48, 206);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f3ece2';
      ctx.font = `800 54px ${SANS}`;
      ctx.fillText(formatPrice(produto.preco, this.expositor.moeda), W - 48, 100);
      ctx.fillStyle = '#b5a796';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText(`${produto.volumeMl ?? ''} ml · ${produto.teorAlcoolico}% vol`, W - 48, 150);
    }
    this.texture.needsUpdate = true;
  }
}
