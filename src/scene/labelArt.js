// Rótulos redesenhados em canvas, um template por marca, seguindo as fotos de referência do
// cliente (docs/referencias/rotulos.md): tipografia equivalente, paleta medida, hierarquia e
// emblemas vetoriais simplificados. As fotos NÃO são usadas como textura (princípio VI).
//
// Um template recebe o produto e um "kit" e devolve as peças do rótulo:
//   kit.part(regiao, { t0, t1, arco, centro, inclinacao }, desenhar, opcoes)
//     t0/t1 = faixa de altura (fração da garrafa); arco = meia-abertura em graus em torno da
//     frente (centro 90°). `desenhar(ctx, w, h)` recebe um espaço já na proporção física.
//   kit.capsule(desenhar, opcoes) — arte da cápsula do gargalo (360°; a frente fica em x = 0,75·w).

import { formatPrice } from '../core/catalog.js';

export const LABEL_FONTS = [
  '400 40px Cinzel', '700 40px Cinzel', '900 40px Cinzel',
  '700 40px "Playfair Display"', '900 40px "Playfair Display"', 'italic 700 40px "Playfair Display"',
  '400 40px Rye', '400 40px "Pinyon Script"',
  '500 40px "Cormorant Garamond"', '600 40px "Cormorant Garamond"', '700 40px "Cormorant Garamond"',
  '400 40px "Yuji Syuku"', '500 40px Archivo', '700 40px Archivo', '800 40px Archivo',
  '400 40px "IBM Plex Mono"', '700 40px "IBM Plex Mono"',
  '500 40px "Libre Franklin"', '700 40px "Libre Franklin"', '600 40px "Zilla Slab"', '700 40px "Zilla Slab"',
  'italic 500 40px "Cormorant Garamond"', 'italic 600 40px "Cormorant Garamond"',
];

// ---------------------------------------------------------------- utilitários de desenho

const FALLBACK = { serif: 'Georgia, serif', sans: 'Arial, sans-serif', script: 'cursive' };
const fam = (f) => `${f}, ${/Pinyon/.test(f) ? FALLBACK.script : /Archivo|Plex|Franklin/.test(f) ? FALLBACK.sans : FALLBACK.serif}`;
const fontStr = ({ family = 'Cinzel', weight = 400, size = 20, style = 'normal' }) => `${style} ${weight} ${size}px ${fam(family)}`;

function rand(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const hash = (str) => [...str].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function widthOf(ctx, s, track) {
  if (!track) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + track;
  return w - track;
}

// Texto com espaçamento entre letras, ajuste à largura e contorno opcional.
function text(ctx, s, x, y, o = {}) {
  let size = o.size ?? 20;
  ctx.font = fontStr({ ...o, size });
  let track = (o.track ?? 0) * size;
  if (o.maxW) {
    while (widthOf(ctx, s, track) > o.maxW && size > 6) {
      size -= 1;
      ctx.font = fontStr({ ...o, size });
      track = (o.track ?? 0) * size;
    }
  }
  const total = widthOf(ctx, s, track);
  const align = o.align ?? 'center';
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  ctx.textBaseline = o.baseline ?? 'middle';
  const paint = (fn) => {
    if (!track) return fn(s, cx);
    let px = cx;
    for (const ch of s) {
      fn(ch, px);
      px += ctx.measureText(ch).width + track;
    }
  };
  if (o.stroke) {
    ctx.strokeStyle = o.stroke.color;
    ctx.lineWidth = o.stroke.width;
    ctx.lineJoin = 'round';
    paint((ch, px) => ctx.strokeText(ch, px, y));
  }
  ctx.fillStyle = o.color ?? '#111';
  paint((ch, px) => ctx.fillText(ch, px, y));
  return size;
}

// Texto em arco: r > 0 arqueia para cima (convexo), r < 0 para baixo (côncavo).
function arcText(ctx, s, cx, cy, r, o = {}) {
  const size = o.size ?? 20;
  ctx.font = fontStr({ ...o, size });
  const track = (o.track ?? 0) * size;
  const widths = [...s].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (s.length - 1);
  const R = Math.abs(r);
  const dir = Math.sign(r) || 1;
  let a = -total / R / 2;
  ctx.fillStyle = o.color ?? '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...s].forEach((ch, i) => {
    const aw = widths[i] / R;
    const ang = a + aw / 2;
    ctx.save();
    ctx.translate(cx + Math.sin(ang) * R, cy - dir * Math.cos(ang) * R + dir * R);
    ctx.rotate(dir * ang);
    if (o.stroke) {
      ctx.strokeStyle = o.stroke.color;
      ctx.lineWidth = o.stroke.width;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += aw + track / R;
  });
}

function rule(ctx, x0, x1, y, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

function grain(ctx, w, h, seed, amount = 0.035, count = 2600) {
  const r = rand(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${amount * r()})` : `rgba(60,40,20,${amount * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  ctx.restore();
}

function fibers(ctx, w, h, seed) {
  const r = rand(seed);
  ctx.save();
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = `rgba(120,105,85,${0.06 + r() * 0.08})`;
    const x = r() * w;
    const y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 50, y + (r() - 0.5) * 50);
    ctx.stroke();
  }
  ctx.restore();
}

// Desenha um polígono definido em [0,1]² dentro da caixa (x, y, w, h), suavizando os vértices.
function blob(ctx, pts, x, y, w, h, smooth = true) {
  const P = pts.map(([px, py]) => [x + px * w, y + py * h]);
  ctx.beginPath();
  if (!smooth) {
    P.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  } else {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(P[P.length - 1], P[0]);
    ctx.moveTo(...start);
    P.forEach((p, i) => ctx.quadraticCurveTo(p[0], p[1], ...mid(p, P[(i + 1) % P.length])));
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function shieldPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.quadraticCurveTo(x + w, y + h * 0.88, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.88, x, y + h * 0.55);
  ctx.closePath();
}

function seal(ctx, cx, cy, r, fill, ring, label, inner, innerFont) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  if (label) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    arcText(ctx, label, cx, cy - r * 0.77, r * 0.77, { family: 'Cinzel', weight: 700, size: r * 0.2, color: ring, track: 0.06 });
  }
  if (inner) text(ctx, inner, cx, cy + r * 0.04, { color: ring, size: r * 0.5, ...innerFont });
}

// Bisão estilizado (Buffalo Trace): silhueta com corcova, chifre e barba.
const BISON = [[0.03, 0.56], [0.1, 0.42], [0.22, 0.36], [0.36, 0.31], [0.48, 0.17], [0.58, 0.09], [0.68, 0.1], [0.77, 0.19],
  [0.85, 0.25], [0.93, 0.31], [0.98, 0.42], [0.99, 0.56], [0.95, 0.67], [0.88, 0.74], [0.81, 0.68], [0.75, 0.8], [0.74, 0.97],
  [0.66, 0.97], [0.64, 0.82], [0.5, 0.79], [0.37, 0.81], [0.34, 0.97], [0.26, 0.97], [0.24, 0.8], [0.1, 0.74], [0.04, 0.7]];

function bison(ctx, x, y, w, h, seed) {
  ctx.save();
  blob(ctx, BISON, x, y, w, h);
  ctx.fillStyle = '#9a7a56';
  ctx.fill();
  ctx.clip();
  // pelagem mais escura na corcova, cabeça e barba + hachuras de gravura
  const g = ctx.createRadialGradient(x + w * 0.72, y + h * 0.35, 0, x + w * 0.72, y + h * 0.35, w * 0.45);
  g.addColorStop(0, 'rgba(58,36,20,0.85)');
  g.addColorStop(1, 'rgba(45,28,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const r = rand(seed);
  ctx.strokeStyle = 'rgba(40,25,14,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 4 + r() * 6, py + 6 + r() * 6);
    ctx.stroke();
  }
  ctx.restore();
  // chifre
  ctx.strokeStyle = '#e8dcc4';
  ctx.lineWidth = w * 0.025;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.84, y + h * 0.3);
  ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.16, x + w * 0.88, y + h * 0.14);
  ctx.stroke();
  // olho
  ctx.fillStyle = '#efe4cf';
  ctx.beginPath();
  ctx.arc(x + w * 0.9, y + h * 0.42, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
}

// Homem caminhando (Johnnie Walker), silhueta simplificada.
function striding(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const P = (pts) => {
    blob(ctx, pts, x, y, w, h, false);
    ctx.fill();
  };
  P([[0.43, 0.02], [0.57, 0.02], [0.57, 0.13], [0.62, 0.14], [0.62, 0.16], [0.38, 0.16], [0.38, 0.14], [0.43, 0.13]]); // cartola
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.215, w * 0.05, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  P([[0.42, 0.27], [0.6, 0.27], [0.65, 0.48], [0.6, 0.56], [0.44, 0.56], [0.39, 0.44]]); // casaca
  P([[0.42, 0.44], [0.27, 0.64], [0.37, 0.66], [0.47, 0.53]]); // aba da casaca
  P([[0.53, 0.54], [0.72, 0.77], [0.79, 0.95], [0.88, 0.96], [0.81, 0.91], [0.77, 0.75], [0.61, 0.53]]); // perna da frente
  P([[0.46, 0.54], [0.36, 0.78], [0.25, 0.93], [0.34, 0.96], [0.43, 0.8], [0.53, 0.57]]); // perna de trás
  ctx.lineWidth = w * 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.6, y + h * 0.31);
  ctx.lineTo(x + w * 0.72, y + h * 0.46);
  ctx.stroke();
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.72, y + h * 0.45);
  ctx.lineTo(x + w * 0.8, y + h * 0.96);
  ctx.stroke();
  ctx.restore();
}

// Casa com frontões (Macallan, Easter Elchies House), simplificada.
function castle(ctx, cx, y, w, h, color) {
  const x = cx - w / 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h * 0.42, w, h * 0.58);
  for (const [gx, gw, gh] of [[0.0, 0.26, 0.42], [0.37, 0.26, 0.5], [0.74, 0.26, 0.42]]) {
    ctx.beginPath();
    ctx.moveTo(x + w * gx, y + h * 0.44);
    ctx.lineTo(x + w * (gx + gw / 2), y + h * (0.44 - gh * 0.7));
    ctx.lineTo(x + w * (gx + gw), y + h * 0.44);
    ctx.fill();
    ctx.fillRect(x + w * (gx + gw / 2) - w * 0.02, y + h * (0.44 - gh * 0.95), w * 0.04, h * 0.14); // chaminé
  }
  ctx.fillStyle = '#f4f3ee';
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) ctx.fillRect(x + w * (0.06 + c * 0.13), y + h * (0.52 + r * 0.22), w * 0.06, h * 0.13);
  ctx.fillStyle = color;
  ctx.fillRect(x + w * 0.44, y + h * 0.74, w * 0.12, h * 0.26);
}

// Nó entrelaçado (emblema Chivas), simplificado.
function knot(ctx, cx, cy, s, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.18, cy - s * 0.12, s * 0.28, s * 0.36, -0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.18, cy + s * 0.1, s * 0.28, s * 0.36, -0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy + s * 0.05);
  ctx.lineTo(cx + s * 0.55, cy - s * 0.05);
  ctx.stroke();
  ctx.restore();
}

function filigree(ctx, x, y, s, color, flipX = 1, flipY = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX, flipY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(s * 0.5, -s * 0.1, s * 0.8, s * 0.3, s * 0.45, s * 0.45);
  ctx.bezierCurveTo(s * 0.2, s * 0.55, s * 0.15, s * 0.25, s * 0.35, s * 0.25);
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-s * 0.1, s * 0.5, s * 0.3, s * 0.8, s * 0.45, s * 0.45);
  ctx.stroke();
  ctx.restore();
}

// Recorte em papel rasgado (bordas irregulares).
function tornBand(ctx, w, h, top, bottom, seed, color) {
  const r = rand(seed);
  ctx.beginPath();
  ctx.moveTo(0, top + r() * 8);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, top + Math.sin(x * 0.02) * 6 + r() * 7);
  for (let x = w; x >= 0; x -= 6) ctx.lineTo(x, bottom - Math.sin(x * 0.017 + 1) * 6 - r() * 7);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, '#c9ae86');
  g.addColorStop(0.2, color);
  g.addColorStop(0.8, color);
  g.addColorStop(1, '#c4a77e');
  ctx.fillStyle = g;
  ctx.fill();
}

// ---------------------------------------------------------------- templates por marca

const T = (p, k, def) => p.rotulo.textos[k] ?? def;
const abv = (p) => `${String(p.teorAlcoolico).replace('.', ',')}% vol`;
const ml = (p) => (p.volumeMl ? `${p.volumeMl} ml` : '');

const STYLES = {
  'buffalo-trace'(p, kit) {
    kit.part('main', { t0: 0.27, t1: 0.49, arco: 84 }, (ctx, w, h) => {
      tornBand(ctx, w, h, h * 0.06, h * 0.94, hash(p.id), '#dcc7a3');
      grain(ctx, w, h, hash(p.id) + 1, 0.05);
      bison(ctx, w * 0.24, h * 0.18, w * 0.36, h * 0.7, hash(p.id) + 2);
    });
    kit.part('aux1', { t0: 0.07, t1: 0.26, arco: 70, lift: 0.0004 }, (ctx, w, h) => {
      const cream = '#f2dcc0';
      text(ctx, T(p, 'nome', 'BUFFALO TRACE'), w / 2, h * 0.27, { family: 'Cinzel', weight: 700, size: h * 0.3, color: cream, track: 0.02, maxW: w * 0.6 });
      text(ctx, 'KENTUCKY', w / 2, h * 0.58, { family: 'Cinzel', weight: 700, size: h * 0.12, color: cream, track: 0.12 });
      text(ctx, 'STRAIGHT BOURBON', w / 2, h * 0.73, { family: 'Cinzel', weight: 700, size: h * 0.12, color: cream, track: 0.12 });
      text(ctx, 'WHISKEY', w / 2, h * 0.88, { family: 'Cinzel', weight: 700, size: h * 0.12, color: cream, track: 0.12 });
    }, { surface: kit.SURFACES.vidroImpresso, foil: false });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      for (const y of [0.1, 0.16, 0.8, 0.86]) rule(ctx, 0, w, h * y, '#8fa092', 1.4);
      text(ctx, 'BUFFALO TRACE', w * 0.75, h * 0.48, { family: 'Cinzel', weight: 700, size: h * 0.07, color: '#9fb0a2', track: 0.2 });
    });
  },

  'woodford-reserve'(p, kit) {
    const gold = '#e9c88f';
    kit.part('main', { t0: 0.4, t1: 0.77, arco: 60, lift: 0.0004 }, (ctx, w, h) => {
      ctx.strokeStyle = gold;
      ctx.lineWidth = h * 0.012;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.17, h * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, 'W', w / 2 - h * 0.035, h * 0.15, { family: 'Cinzel', weight: 700, size: h * 0.13, color: gold });
      text(ctx, 'R', w / 2 + h * 0.04, h * 0.2, { family: 'Cinzel', weight: 700, size: h * 0.12, color: gold });
      arcText(ctx, "DISTILLER'S SELECT", w / 2, h * 0.43, w * 0.55, { family: 'Cinzel', weight: 900, size: h * 0.05, color: gold, track: 0.12 });
      text(ctx, T(p, 'nome', 'WOODFORD RESERVE'), w / 2, h * 0.56, { family: 'Cinzel', weight: 900, size: h * 0.085, color: gold, track: 0.06, maxW: w * 0.7 });
      text(ctx, 'KENTUCKY STRAIGHT BOURBON WHISKEY', w / 2, h * 0.68, { family: 'Cinzel', weight: 900, size: h * 0.04, color: gold, track: 0.12, maxW: w * 0.66 });
      rule(ctx, w * 0.45, w * 0.55, h * 0.8, gold, 2);
      rule(ctx, w * 0.45, w * 0.55, h * 0.83, gold, 2);
    }, { surface: kit.SURFACES.vidroImpresso });
    kit.part('aux1', { t0: 0.11, t1: 0.2, arco: 52 }, (ctx, w, h) => {
      ctx.fillStyle = '#ece3cc';
      ctx.fillRect(0, h * 0.08, w, h * 0.84);
      grain(ctx, w, h, 5, 0.04, 800);
      ctx.strokeStyle = '#7a6a55';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.02, h * 0.14, w * 0.96, h * 0.72);
      seal(ctx, w * 0.1, h * 0.62, h * 0.3, '#ece3cc', '#8a4d2a', 'PROPRIETARY', 'BATCH', { family: 'Cinzel', weight: 700, size: h * 0.1 });
      text(ctx, `${String(p.teorAlcoolico).replace('.', ',')}% Alc. Vol.`, w * 0.1, h * 0.27, { family: 'Cinzel', weight: 700, size: h * 0.11, color: '#3a2a1a' });
      text(ctx, 'LABEL BATCH', w * 0.36, h * 0.3, { family: 'Archivo', weight: 700, size: h * 0.07, color: '#6b5a45', track: 0.1 });
      text(ctx, '0002', w * 0.36, h * 0.5, { family: 'IBM Plex Mono', weight: 400, size: h * 0.18, color: '#2a2018', track: 0.2 });
      text(ctx, 'BOTTLE No.', w * 0.58, h * 0.3, { family: 'Archivo', weight: 700, size: h * 0.07, color: '#6b5a45', track: 0.1 });
      text(ctx, '2784', w * 0.58, h * 0.5, { family: 'Cinzel', weight: 700, size: h * 0.18, color: '#2a2018', track: 0.1 });
      text(ctx, 'Master Distiller', w * 0.84, h * 0.5, { family: 'Pinyon Script', size: h * 0.2, color: '#2a3b6a' });
      text(ctx, `CONT. NET. ${ml(p)}`, w * 0.6, h * 0.74, { family: 'Archivo', weight: 500, size: h * 0.13, color: '#2a2018', track: 0.04 });
    });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 9, 0.05, 500);
      ctx.fillStyle = '#d9c7a6';
      ctx.fillRect(w * 0.735, 0, w * 0.03, h); // tira vertical na frente (θ = 90°)
      rule(ctx, 0, w, h * 0.3, '#c9ad7a', 1.2);
      text(ctx, 'THE PROPRIETARY BATCH · UNPARALLELED QUALITY', w * 0.5, h * 0.2, { family: 'Cinzel', weight: 700, size: h * 0.06, color: '#d9b77a', track: 0.08, maxW: w });
    });
  },

  'jack-daniels'(p, kit) {
    const white = '#f4f1ea';
    kit.part('main', { t0: 0.09, t1: 0.5, arco: 44 }, (ctx, w, h) => {
      ctx.fillStyle = '#131312';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = white;
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
      ctx.lineWidth = 1;
      ctx.strokeRect(w * 0.06, h * 0.045, w * 0.88, h * 0.91);
      filigree(ctx, w * 0.1, h * 0.09, w * 0.16, white, 1, 1);
      filigree(ctx, w * 0.9, h * 0.09, w * 0.16, white, -1, 1);
      filigree(ctx, w * 0.1, h * 0.91, w * 0.16, white, 1, -1);
      filigree(ctx, w * 0.9, h * 0.91, w * 0.16, white, -1, -1);
      arcText(ctx, "JACK DANIEL'S", w / 2, h * 0.17, w * 0.62, { family: 'Rye', size: h * 0.085, color: white, track: 0.02 });
      ctx.strokeStyle = white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.33, w * 0.2, h * 0.075, 0, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, 'OLD', w / 2, h * 0.285, { family: 'Archivo', weight: 700, size: h * 0.025, color: white, track: 0.2 });
      text(ctx, 'No.7', w / 2, h * 0.33, { family: 'Playfair Display', weight: 900, size: h * 0.05, color: white });
      text(ctx, 'BRAND', w / 2, h * 0.375, { family: 'Archivo', weight: 700, size: h * 0.025, color: white, track: 0.2 });
      text(ctx, 'QUALITY', w / 2, h * 0.45, { family: 'Archivo', weight: 700, size: h * 0.026, color: white, track: 0.25 });
      text(ctx, 'Tennessee', w / 2, h * 0.52, { family: 'Rye', size: h * 0.075, color: white });
      text(ctx, 'SOUR MASH', w / 2, h * 0.59, { family: 'Playfair Display', weight: 700, size: h * 0.03, color: white, track: 0.25 });
      text(ctx, 'WHISKEY', w / 2, h * 0.655, { family: 'Playfair Display', weight: 900, size: h * 0.07, color: white, track: 0.06 });
      text(ctx, 'DISTILLED AND BOTTLED BY', w / 2, h * 0.73, { family: 'Archivo', weight: 700, size: h * 0.022, color: white, track: 0.12 });
      text(ctx, 'JACK DANIEL DISTILLERY', w / 2, h * 0.77, { family: 'Playfair Display', weight: 700, size: h * 0.032, color: white, track: 0.06 });
      text(ctx, 'LYNCHBURG, TENNESSEE, USA', w / 2, h * 0.81, { family: 'Archivo', weight: 700, size: h * 0.02, color: white, track: 0.12 });
      text(ctx, `${p.teorAlcoolico}% ALC/VOL · ${Math.round(p.teorAlcoolico * 2)} PROOF · ${ml(p).toUpperCase()}`, w / 2, h * 0.88, { family: 'Archivo', weight: 700, size: h * 0.024, color: white, track: 0.06, maxW: w * 0.8 });
    }, { surface: kit.SURFACES.papelBrilho, foil: false });
    kit.part('aux2', { t0: 0.745, t1: 0.85, arco: 42 }, (ctx, w, h) => {
      ctx.fillStyle = '#131312';
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'OLD', w / 2, h * 0.24, { family: 'Archivo', weight: 700, size: h * 0.14, color: white, track: 0.2 });
      text(ctx, 'No.7', w / 2, h * 0.5, { family: 'Playfair Display', weight: 900, size: h * 0.26, color: white });
      text(ctx, 'BRAND', w / 2, h * 0.76, { family: 'Archivo', weight: 700, size: h * 0.14, color: white, track: 0.2 });
    }, { surface: kit.SURFACES.papelBrilho, foil: false });
    kit.part('aux3', { t0: 0.55, t1: 0.6, arco: 44, lift: 0.0003 }, (ctx, w, h) => {
      text(ctx, "JACK DANIEL'S", w / 2, h * 0.5, { family: 'Cinzel', weight: 700, size: h * 0.7, color: 'rgba(255,170,90,0.85)', track: 0.12, maxW: w * 0.9 });
    }, { surface: kit.SURFACES.vidroImpresso, foil: false });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 5) rule(ctx, x, x, h * 0.35, '#262626', 1);
    });
  },

  jameson(p, kit) {
    const green = '#1e5a38';
    const red = '#b3242a';
    const gold = '#c9a24c';
    kit.part('main', { t0: 0.3, t1: 0.585, arco: 80 }, (ctx, w, h) => {
      ctx.fillStyle = '#f3e7d2';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 4, 0.03);
      ctx.fillStyle = green;
      ctx.fillRect(0, 0, w, h * 0.06);
      rule(ctx, 0, w, h * 0.075, gold, 2);
      text(ctx, T(p, 'nome', 'JAMESON'), w / 2, h * 0.2, { family: 'Playfair Display', weight: 900, size: h * 0.17, color: green, track: 0.04, stroke: { color: red, width: 4 }, maxW: w * 0.82 });
      shieldPath(ctx, w / 2 - h * 0.075, h * 0.33, h * 0.15, h * 0.17);
      ctx.fillStyle = red;
      ctx.fill();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#f3e7d2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w / 2 - h * 0.06, h * 0.345);
      ctx.lineTo(w / 2 + h * 0.06, h * 0.48);
      ctx.moveTo(w / 2 + h * 0.06, h * 0.345);
      ctx.lineTo(w / 2 - h * 0.06, h * 0.48);
      ctx.stroke();
      ctx.fillStyle = gold;
      ctx.beginPath(); // navio estilizado sobre o escudo
      ctx.moveTo(w / 2 - h * 0.05, h * 0.3);
      ctx.lineTo(w / 2 + h * 0.05, h * 0.3);
      ctx.lineTo(w / 2 + h * 0.035, h * 0.322);
      ctx.lineTo(w / 2 - h * 0.035, h * 0.322);
      ctx.fill();
      ctx.fillRect(w / 2 - 1.5, h * 0.255, 3, h * 0.045);
      text(ctx, 'ESTD', w / 2 - h * 0.2, h * 0.41, { family: 'Playfair Display', weight: 700, size: h * 0.045, color: '#2a2018' });
      text(ctx, '1780', w / 2 + h * 0.2, h * 0.41, { family: 'Playfair Display', weight: 700, size: h * 0.045, color: '#2a2018' });
      ctx.fillStyle = gold;
      ctx.fillRect(w / 2 - h * 0.09, h * 0.52, h * 0.18, h * 0.035);
      text(ctx, 'SINE METU', w / 2, h * 0.538, { family: 'Cinzel', weight: 700, size: h * 0.022, color: '#3a2a10', track: 0.15 });
      text(ctx, 'TRIPLE DISTILLED', w / 2, h * 0.64, { family: 'Archivo', weight: 800, size: h * 0.06, color: '#1d1a17', track: 0.04 });
      text(ctx, 'IRISH WHISKEY', w / 2, h * 0.73, { family: 'Archivo', weight: 800, size: h * 0.06, color: green, track: 0.06 });
      rule(ctx, w * 0.12, w * 0.25, h * 0.73, green, 2);
      rule(ctx, w * 0.75, w * 0.88, h * 0.73, green, 2);
      text(ctx, 'CRAFTED FOR SMOOTHNESS', w / 2, h * 0.82, { family: 'Archivo', weight: 700, size: h * 0.035, color: '#8a6a2a', track: 0.08 });
      text(ctx, 'AT THE MIDLETON DISTILLERY', w / 2, h * 0.88, { family: 'Archivo', weight: 700, size: h * 0.035, color: '#8a6a2a', track: 0.08 });
      rule(ctx, 0, w, h * 0.965, gold, 3);
    });
    kit.part('aux1', { t0: 0.19, t1: 0.3, arco: 80 }, (ctx, w, h) => {
      ctx.fillStyle = green;
      ctx.fillRect(0, 0, w, h);
      rule(ctx, 0, w, h * 0.12, gold, 3);
      rule(ctx, 0, w, h * 0.7, gold, 2);
      text(ctx, 'John Jameson & Son', w / 2, h * 0.42, { family: 'Pinyon Script', size: h * 0.36, color: '#d8b562', maxW: w * 0.5 });
      text(ctx, 'PRODUCT OF IRELAND', w / 2, h * 0.84, { family: 'Archivo', weight: 700, size: h * 0.12, color: '#e8dcc0', track: 0.18 });
      text(ctx, ml(p), w * 0.2, h * 0.42, { family: 'Archivo', weight: 700, size: h * 0.1, color: '#e8dcc0' });
      text(ctx, abv(p).toUpperCase(), w * 0.8, h * 0.42, { family: 'Archivo', weight: 700, size: h * 0.1, color: '#e8dcc0' });
    });
    kit.part('aux2', { t0: 0.715, t1: 0.79, arco: 24 }, (ctx, w, h) => {
      seal(ctx, w / 2, h / 2, Math.min(w, h) * 0.48, red, '#f0dfc0', 'JOHN JAMESON & SON LIMITED', 'JJ&S', { family: 'Playfair Display', weight: 900, size: h * 0.2 });
    });
    kit.part('aux3', { t0: 0.09, t1: 0.16, arco: 50, lift: 0.0003 }, (ctx, w, h) => {
      text(ctx, '1780', w / 2, h * 0.5, { family: 'Playfair Display', weight: 900, size: h * 0.8, color: 'rgba(150,200,140,0.5)', track: 0.3 });
    }, { surface: kit.SURFACES.vidroImpresso, foil: false });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = green;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillStyle = '#f0e4cc';
      ctx.fillRect(w * 0.72, h * 0.62, w * 0.06, h * 0.38);
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h * 0.62);
      rule(ctx, 0, w, h * 0.62, gold, 2);
      text(ctx, 'John Jameson', w * 0.75, h * 0.4, { family: 'Pinyon Script', size: h * 0.16, color: '#f0dfc0', maxW: w * 0.2 });
    });
  },

  'chivas-regal'(p, kit) {
    const maroon = '#8f1d1d';
    const gold = '#bb8929';
    kit.part('main', { t0: 0.235, t1: 0.6, arco: 64 }, (ctx, w, h) => {
      const x = w * 0.08;
      const sw = w * 0.84;
      ctx.beginPath(); // escudo com volutas no topo
      ctx.moveTo(x, h * 0.12);
      ctx.quadraticCurveTo(x + sw * 0.1, h * 0.02, x + sw * 0.25, h * 0.08);
      ctx.quadraticCurveTo(x + sw * 0.5, h * 0.0, x + sw * 0.75, h * 0.08);
      ctx.quadraticCurveTo(x + sw * 0.9, h * 0.02, x + sw, h * 0.12);
      ctx.lineTo(x + sw * 0.97, h * 0.68);
      ctx.quadraticCurveTo(x + sw * 0.9, h * 0.9, x + sw * 0.5, h);
      ctx.quadraticCurveTo(x + sw * 0.1, h * 0.9, x + sw * 0.03, h * 0.68);
      ctx.closePath();
      const g = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.6);
      g.addColorStop(0, '#f1efea');
      g.addColorStop(1, '#bdbab4');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      for (let a = 0; a < Math.PI * 2; a += 0.09) {
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.52);
        ctx.lineTo(w / 2 + Math.cos(a) * w, h * 0.52 + Math.sin(a) * w);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 6;
      ctx.stroke();
      text(ctx, 'PRINCE OF WHISKIES', w / 2, h * 0.11, { family: 'Cinzel', weight: 700, size: h * 0.025, color: '#4a3a20', track: 0.12 });
      ctx.fillStyle = maroon;
      ctx.fillRect(w * 0.12, h * 0.16, w * 0.76, h * 0.14);
      rule(ctx, w * 0.12, w * 0.88, h * 0.165, gold, 3);
      rule(ctx, w * 0.12, w * 0.88, h * 0.295, gold, 3);
      text(ctx, T(p, 'nome', 'CHIVAS'), w / 2, h * 0.232, { family: 'Playfair Display', weight: 900, size: h * 0.11, color: '#f6efe2', track: 0.06, maxW: w * 0.7 });
      text(ctx, 'ESTD', w * 0.25, h * 0.41, { family: 'Cinzel', weight: 700, size: h * 0.035, color: '#4a3a20' });
      text(ctx, '1801', w * 0.75, h * 0.41, { family: 'Cinzel', weight: 700, size: h * 0.035, color: '#4a3a20' });
      knot(ctx, w / 2, h * 0.43, h * 0.15, maroon, h * 0.02);
      ctx.fillStyle = maroon;
      ctx.fillRect(w * 0.2, h * 0.56, w * 0.6, h * 0.07);
      text(ctx, 'REGAL', w / 2, h * 0.596, { family: 'Playfair Display', weight: 900, size: h * 0.05, color: '#f6efe2', track: 0.25 });
      text(ctx, 'BLENDED SCOTCH', w / 2, h * 0.7, { family: 'Cinzel', weight: 700, size: h * 0.04, color: '#2a2018', track: 0.08 });
      text(ctx, 'WHISKY', w / 2, h * 0.76, { family: 'Cinzel', weight: 700, size: h * 0.04, color: '#2a2018', track: 0.08 });
    }, { surface: kit.SURFACES.papelBrilho, foil: 'silver' });
    kit.part('aux1', { t0: 0.13, t1: 0.215, arco: 64 }, (ctx, w, h) => {
      ctx.fillStyle = '#7a120b';
      ctx.fillRect(0, 0, w, h);
      rule(ctx, 0, w, h * 0.08, gold, 4);
      rule(ctx, 0, w, h * 0.92, gold, 4);
      text(ctx, 'XII', w * 0.14, h * 0.52, { family: 'Playfair Display', weight: 900, size: h * 0.55, color: '#f4ece0' });
      text(ctx, 'AGED', w * 0.5, h * 0.35, { family: 'Cinzel', weight: 700, size: h * 0.16, color: '#f4ece0', track: 0.2 });
      text(ctx, 'YEARS', w * 0.5, h * 0.6, { family: 'Cinzel', weight: 700, size: h * 0.16, color: '#f4ece0', track: 0.2 });
      text(ctx, 'PRODUCT OF SCOTLAND', w * 0.5, h * 0.82, { family: 'Archivo', weight: 700, size: h * 0.09, color: gold, track: 0.12 });
      text(ctx, '12', w * 0.86, h * 0.52, { family: 'Playfair Display', weight: 900, size: h * 0.6, color: '#f4ece0' });
    });
    kit.part('aux2', { t0: 0.67, t1: 0.74, arco: 22, lift: 0.0003 }, (ctx, w, h) => {
      knot(ctx, w / 2, h / 2, Math.min(w, h) * 0.8, 'rgba(255,214,140,0.4)', Math.min(w, h) * 0.06);
    }, { surface: kit.SURFACES.vidroImpresso, foil: false });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(190,60,50,0.45)';
      for (let y = 8; y < h * 0.85; y += 14) for (let x = (y / 14) % 2 ? 0 : 7; x < w; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.fill();
      }
      ctx.fillStyle = gold;
      ctx.fillRect(0, h * 0.86, w, h * 0.1);
    }, { surface: kit.SURFACES.capsula });
  },

  'johnnie-walker-black'(p, kit) {
    const gold = '#d4ae5a';
    kit.part('main', { t0: 0.4, t1: 0.76, arco: 44 }, (ctx, w, h) => {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((-24 * Math.PI) / 180);
      const bw = w * 1.5;
      const bh = h * 0.46;
      ctx.fillStyle = '#141414';
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      rule(ctx, -bw / 2, bw / 2, -bh / 2 + 5, gold, 3);
      rule(ctx, -bw / 2, bw / 2, bh / 2 - 5, gold, 3);
      rule(ctx, -bw / 2, bw / 2, -bh / 2 + 11, gold, 1);
      rule(ctx, -bw / 2, bw / 2, bh / 2 - 11, gold, 1);
      text(ctx, 'JOHNNIE WALKER', 0, -bh * 0.27, { family: 'Cinzel', weight: 700, size: bh * 0.13, color: '#efe6d2', track: 0.06, maxW: w * 0.85 });
      text(ctx, 'BLACK LABEL', 0, -bh * 0.04, { family: 'Cinzel', weight: 900, size: bh * 0.19, color: gold, track: 0.04, maxW: w * 0.92 });
      text(ctx, 'BLENDED SCOTCH WHISKY', 0, bh * 0.15, { family: 'Cinzel', weight: 700, size: bh * 0.075, color: '#efe6d2', track: 0.16, maxW: w * 0.85 });
      text(ctx, 'John Walker & Sons', 0, bh * 0.33, { family: 'Pinyon Script', size: bh * 0.17, color: gold });
      ctx.restore();
    }, { surface: kit.SURFACES.papelBrilho });
    kit.part('aux1', { t0: 0.17, t1: 0.36, arco: 40, lift: 0.0003 }, (ctx, w, h) => {
      striding(ctx, w * 0.3, h * 0.02, w * 0.4, h * 0.96, '#ecd9b2');
    }, { surface: kit.SURFACES.vidroImpresso });
    kit.part('aux3', { t0: 0.085, t1: 0.14, arco: 30 }, (ctx, w, h) => {
      ctx.fillStyle = '#141414';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      text(ctx, 'AGED', w * 0.22, h * 0.52, { family: 'Cinzel', weight: 700, size: h * 0.28, color: '#efe6d2', track: 0.15 });
      text(ctx, '12', w * 0.5, h * 0.52, { family: 'Cinzel', weight: 900, size: h * 0.7, color: '#efe6d2' });
      text(ctx, 'YEARS', w * 0.78, h * 0.52, { family: 'Cinzel', weight: 700, size: h * 0.28, color: '#efe6d2', track: 0.15 });
    }, { surface: kit.SURFACES.papelBrilho });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'John Walker & Sons', w * 0.75, h * 0.5, { family: 'Pinyon Script', size: h * 0.16, color: gold, maxW: w * 0.2 });
    });
  },

  ballantines(p, kit) {
    const navy = '#1c2a4a';
    const gold = '#b38b3f';
    kit.part('main', { t0: 0.2, t1: 0.57, arco: 44 }, (ctx, w, h) => {
      ctx.beginPath(); // papel com corte em "V" no topo
      ctx.moveTo(0, 0);
      ctx.lineTo(w / 2, h * 0.17);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = '#ebe7cb';
      ctx.fill();
      ctx.save();
      ctx.clip();
      grain(ctx, w, h, 7, 0.04);
      ctx.restore();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, "Ballantine's", w / 2, h * 0.36, { family: 'Pinyon Script', size: h * 0.17, color: navy, maxW: w * 0.94 });
      rule(ctx, w * 0.12, w * 0.32, h * 0.5, gold, 1.5);
      rule(ctx, w * 0.68, w * 0.88, h * 0.5, gold, 1.5);
      text(ctx, 'FINEST', w / 2, h * 0.5, { family: 'Cinzel', weight: 700, size: h * 0.055, color: gold, track: 0.2 });
      text(ctx, 'BLENDED SCOTCH WHISKY', w / 2, h * 0.58, { family: 'Cinzel', weight: 700, size: h * 0.043, color: navy, track: 0.04, maxW: w * 0.9 });
      text(ctx, 'BLENDED & BOTTLED IN SCOTLAND', w / 2, h * 0.65, { family: 'Archivo', weight: 500, size: h * 0.022, color: navy, track: 0.1 });
      text(ctx, 'GEORGE BALLANTINE AND SON,', w / 2, h * 0.7, { family: 'Archivo', weight: 500, size: h * 0.026, color: navy, track: 0.06 });
      text(ctx, 'DUMBARTON, SCOTLAND', w / 2, h * 0.745, { family: 'Archivo', weight: 500, size: h * 0.026, color: navy, track: 0.06 });
      text(ctx, 'PRODUCT OF SCOTLAND', w / 2, h * 0.8, { family: 'Archivo', weight: 500, size: h * 0.022, color: navy, track: 0.1 });
      text(ctx, ml(p), w * 0.1, h * 0.88, { family: 'Archivo', weight: 500, size: h * 0.03, color: navy, align: 'left' });
      text(ctx, abv(p), w * 0.9, h * 0.88, { family: 'Archivo', weight: 500, size: h * 0.03, color: navy, align: 'right' });
      seal(ctx, w / 2, h * 0.9, h * 0.065, '#9b1b1f', '#e9d6b0', null, 'B', { family: 'Pinyon Script', size: h * 0.08 });
    });
    kit.part('aux2', { t0: 0.575, t1: 0.71, arco: 36 }, (ctx, w, h) => {
      const sx = w * 0.32;
      const sy = h * 0.22;
      const sw = w * 0.36;
      const sh = h * 0.6;
      const quads = ['#2a4a8a', '#c9a24c', '#9b1b1f', '#e8dcc0'];
      ctx.save();
      shieldPath(ctx, sx, sy, sw, sh);
      ctx.clip();
      quads.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(sx + (i % 2) * (sw / 2), sy + Math.floor(i / 2) * (sh / 2), sw / 2, sh / 2);
      });
      ctx.restore();
      shieldPath(ctx, sx, sy, sw, sh);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = gold; // coroa sobre o escudo
      ctx.beginPath();
      ctx.moveTo(sx + sw * 0.1, sy - h * 0.02);
      [0.1, 0.3, 0.5, 0.7, 0.9].forEach((f, i) => ctx.lineTo(sx + sw * f, sy - h * (i % 2 ? 0.08 : 0.16)));
      ctx.lineTo(sx + sw * 0.9, sy - h * 0.02);
      ctx.closePath();
      ctx.fill();
      for (const fx of [0.14, 0.86]) {
        ctx.fillStyle = gold; // mastros
        ctx.fillRect(w * fx - 1.5, h * 0.06, 3, h * 0.7);
        ctx.fillStyle = '#2a4a8a'; // bandeiras com aspa
        ctx.fillRect(w * (fx - 0.07), h * 0.02, w * 0.14, h * 0.14);
        ctx.strokeStyle = '#f4f1ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * (fx - 0.07), h * 0.02);
        ctx.lineTo(w * (fx + 0.07), h * 0.16);
        ctx.moveTo(w * (fx + 0.07), h * 0.02);
        ctx.lineTo(w * (fx - 0.07), h * 0.16);
        ctx.stroke();
      }
      text(ctx, 'ESTD', w * 0.2, h * 0.92, { family: 'Cinzel', weight: 700, size: h * 0.07, color: gold });
      text(ctx, '1827', w * 0.8, h * 0.92, { family: 'Cinzel', weight: 700, size: h * 0.07, color: gold });
    }, { surface: kit.SURFACES.papelBrilho });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      text(ctx, "Ballantine's", w * 0.75, h * 0.5, { family: 'Pinyon Script', size: h * 0.2, color: navy, maxW: w * 0.2 });
      rule(ctx, 0, w, h * 0.9, gold, 3);
    });
  },

  macallan(p, kit) {
    const red = '#8f1b22';
    kit.part('main', { t0: 0.17, t1: 0.585, arco: 78 }, (ctx, w, h) => {
      ctx.fillStyle = '#f4f3ee';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 3, 0.02);
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.03, h * 0.025, w * 0.94, h * 0.95);
      castle(ctx, w / 2, h * 0.07, h * 0.15, h * 0.09, '#1a1a1a');
      text(ctx, 'EST. 1824', w / 2, h * 0.2, { family: 'Archivo', weight: 700, size: h * 0.025, color: '#1a1a1a', track: 0.12 });
      text(ctx, 'THE', w / 2, h * 0.27, { family: 'Cormorant Garamond', weight: 700, size: h * 0.04, color: red, track: 0.2 });
      text(ctx, T(p, 'nome', 'MACALLAN'), w / 2, h * 0.34, { family: 'Cormorant Garamond', weight: 700, size: h * 0.105, color: red, track: 0.02, maxW: w * 0.86 });
      text(ctx, '12', w / 2, h * 0.47, { family: 'Cormorant Garamond', weight: 600, size: h * 0.12, color: '#111' });
      text(ctx, 'YEARS OLD', w / 2, h * 0.545, { family: 'Cormorant Garamond', weight: 700, size: h * 0.03, color: '#111', track: 0.12 });
      text(ctx, 'HIGHLAND SINGLE MALT', w / 2, h * 0.63, { family: 'Cormorant Garamond', weight: 700, size: h * 0.04, color: '#111', track: 0.06 });
      text(ctx, 'SCOTCH WHISKY', w / 2, h * 0.675, { family: 'Cormorant Garamond', weight: 700, size: h * 0.04, color: '#111', track: 0.06 });
      text(ctx, 'MATURED IN', w / 2, h * 0.725, { family: 'Cormorant Garamond', weight: 600, size: h * 0.028, color: '#333', track: 0.08 });
      text(ctx, 'SHERRY SEASONED OAK CASKS', w / 2, h * 0.76, { family: 'Cormorant Garamond', weight: 600, size: h * 0.028, color: '#333', track: 0.08 });
      text(ctx, 'NATURAL COLOUR', w / 2, h * 0.795, { family: 'Cormorant Garamond', weight: 600, size: h * 0.028, color: '#333', track: 0.08 });
      text(ctx, '•  •  •  •  •  •', w / 2, h * 0.83, { family: 'Cormorant Garamond', weight: 700, size: h * 0.025, color: '#333' });
      text(ctx, 'DOUBLE CASK COLLECTION', w / 2, h * 0.865, { family: 'Cormorant Garamond', weight: 700, size: h * 0.03, color: '#111', track: 0.08 });
      text(ctx, ml(p), w * 0.08, h * 0.935, { family: 'Cormorant Garamond', weight: 700, size: h * 0.028, color: '#111', align: 'left' });
      text(ctx, 'PRODUCT OF SCOTLAND', w / 2, h * 0.935, { family: 'Archivo', weight: 500, size: h * 0.018, color: '#111', track: 0.1 });
      text(ctx, `alc. ${abv(p)}`, w * 0.92, h * 0.935, { family: 'Cormorant Garamond', weight: 700, size: h * 0.028, color: '#111', align: 'right' });
    });
    kit.part('aux2', { t0: 0.655, t1: 0.755, arco: 26 }, (ctx, w, h) => {
      ctx.beginPath();
      ctx.moveTo(w * 0.04, h * 0.06);
      ctx.lineTo(w * 0.96, h * 0.06);
      ctx.lineTo(w / 2, h * 0.96);
      ctx.closePath();
      ctx.fillStyle = '#f4f3ee';
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3;
      ctx.stroke();
      text(ctx, '12', w / 2, h * 0.3, { family: 'Cormorant Garamond', weight: 700, size: h * 0.24, color: '#111' });
      text(ctx, 'YEARS OLD', w / 2, h * 0.48, { family: 'Archivo', weight: 700, size: h * 0.07, color: '#111', track: 0.1 });
    });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      for (let y = h * 0.04; y < h * 0.22; y += 6) rule(ctx, 0, w, y, '#3a3a3a', 1.5);
    });
  },

  'glenlivet-caribbean'(p, kit) {
    const orange = '#c94a2a';
    const gold = '#c19a45';
    kit.part('main', { t0: 0.33, t1: 0.585, arco: 80 }, (ctx, w, h) => {
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 11, 0.02);
      rule(ctx, 0, w, h * 0.03, '#9a948a', 2);
      rule(ctx, 0, w, h * 0.055, '#9a948a', 1);
      text(ctx, 'THE', w / 2, h * 0.15, { family: 'Cinzel', weight: 900, size: h * 0.075, color: '#1b1b1b', track: 0.1 });
      text(ctx, T(p, 'nome', 'GLENLIVET'), w / 2, h * 0.28, { family: 'Cinzel', weight: 900, size: h * 0.15, color: '#1b1b1b', track: 0.02, maxW: w * 0.62 });
      text(ctx, 'CARIBBEAN RESERVE', w / 2, h * 0.41, { family: 'Cinzel', weight: 700, size: h * 0.06, color: orange, track: 0.08 });
      text(ctx, 'ESTD', w / 2, h * 0.5, { family: 'Cinzel', weight: 700, size: h * 0.045, color: orange, track: 0.1 });
      text(ctx, '1824', w / 2, h * 0.6, { family: 'Cinzel', weight: 700, size: h * 0.1, color: orange, track: 0.05 });
      text(ctx, 'SINGLE MALT', w / 2, h * 0.75, { family: 'Cinzel', weight: 700, size: h * 0.055, color: '#1b1b1b', track: 0.1 });
      text(ctx, 'SCOTCH WHISKY', w / 2, h * 0.84, { family: 'Cinzel', weight: 700, size: h * 0.055, color: '#1b1b1b', track: 0.1 });
      for (const [x, lines] of [[0.15, ['IN 1824 GEORGE SMITH', 'FOUNDED THE DISTILLERY', 'IN THE REMOTE AND', 'WILD GLENLIVET']], [0.85, ['EVER SINCE, ITS', 'SMOOTH, FLORAL STYLE', 'HAS BEEN REGARDED', 'AS THE DEFINITIVE']]]) {
        lines.forEach((l, i) => text(ctx, l, w * x, h * (0.44 + i * 0.06), { family: 'Cormorant Garamond', weight: 600, size: h * 0.034, color: '#3a3a3a', maxW: w * 0.22 }));
      }
    });
    kit.part('aux1', { t0: 0.2, t1: 0.33, arco: 80 }, (ctx, w, h) => {
      ctx.fillStyle = orange;
      ctx.fillRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(w / 2, h * 0.28, w, 0);
      ctx.fillStyle = '#f2efe8';
      ctx.fill();
      seal(ctx, w / 2, h * 0.55, h * 0.32, gold, '#8a6a28', 'THE GLENLIVET', '1824', { family: 'Cinzel', weight: 700, size: h * 0.1 });
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(w * 0.04, h * 0.42, w * 0.14, h * 0.3);
      text(ctx, 'SWEET &', w * 0.11, h * 0.52, { family: 'Archivo', weight: 800, size: h * 0.07, color: orange });
      text(ctx, 'TROPICAL', w * 0.11, h * 0.63, { family: 'Archivo', weight: 800, size: h * 0.07, color: orange });
      text(ctx, 'SELECTIVELY FINISHED IN BARRELS', w * 0.76, h * 0.5, { family: 'Cinzel', weight: 700, size: h * 0.06, color: '#f6ead8', maxW: w * 0.38 });
      text(ctx, 'THAT HELD CARIBBEAN RUM', w * 0.76, h * 0.63, { family: 'Cinzel', weight: 700, size: h * 0.06, color: '#f6ead8', maxW: w * 0.38 });
      text(ctx, `${ml(p)} · ${abv(p)}`, w * 0.5, h * 0.93, { family: 'Archivo', weight: 700, size: h * 0.07, color: '#f6ead8', track: 0.1 });
    });
    kit.part('aux2', { t0: 0.655, t1: 0.72, arco: 22 }, (ctx, w, h) => {
      seal(ctx, w / 2, h / 2, Math.min(w, h) * 0.48, '#b9933f', '#6e5220', 'GEORGE & J.G. SMITH', '1824', { family: 'Cinzel', weight: 700, size: h * 0.16 });
    });
    kit.part('aux3', { t0: 0.07, t1: 0.12, arco: 60, lift: 0.0003 }, (ctx, w, h) => {
      text(ctx, 'GEORGE & J. G. SMITH LTD', w / 2, h / 2, { family: 'Cinzel', weight: 700, size: h * 0.6, color: 'rgba(255,215,140,0.6)', track: 0.12, maxW: w * 0.92 });
    }, { surface: kit.SURFACES.vidroImpresso, foil: false });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'THE', w * 0.75, h * 0.2, { family: 'Cinzel', weight: 700, size: h * 0.08, color: '#f6ead8', track: 0.1, maxW: w * 0.2 });
      text(ctx, 'GLENLIVET', w * 0.75, h * 0.32, { family: 'Cinzel', weight: 900, size: h * 0.11, color: '#f6ead8', track: 0.02, maxW: w * 0.2 });
      text(ctx, 'George Smith', w * 0.75, h * 0.6, { family: 'Pinyon Script', size: h * 0.14, color: '#f6ead8', maxW: w * 0.2 });
      rule(ctx, 0, w, h * 0.92, '#f6ead8', 2);
    });
  },

  hibiki(p, kit) {
    kit.part('main', { t0: 0.2, t1: 0.66, arco: 64 }, (ctx, w, h) => {
      ctx.fillStyle = '#eee9e1';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 21, 0.03);
      fibers(ctx, w, h, 22);
      text(ctx, '響', w * 0.63, h * 0.4, { family: 'Yuji Syuku', size: h * 0.52, color: '#171412' });
      text(ctx, T(p, 'nome', 'HIBIKI'), w * 0.3, h * 0.56, { family: 'Cormorant Garamond', weight: 700, size: h * 0.1, color: '#171412', track: 0.04, maxW: w * 0.24 });
      text(ctx, 'SUNTORY WHISKY', w * 0.3, h * 0.645, { family: 'Cormorant Garamond', weight: 700, size: h * 0.04, color: '#171412', track: 0.06, maxW: w * 0.24 });
      text(ctx, 'JAPANESE HARMONY', w / 2, h * 0.79, { family: 'Cormorant Garamond', weight: 700, size: h * 0.055, color: '#c88a2a', track: 0.06, maxW: w * 0.66 });
      text(ctx, 'A meticulous blend of the finest select whiskies', w / 2, h * 0.87, { family: 'Cormorant Garamond', weight: 600, size: h * 0.032, color: '#4a4440', maxW: w * 0.7 });
    });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = p.garrafa.capsula.cor;
      ctx.fillRect(0, 0, w, h);
      rule(ctx, 0, w, h * 0.86, '#7b3f8c', 3);
      text(ctx, 'BLENDED JAPANESE WHISKY', w * 0.75, h * 0.34, { family: 'Cormorant Garamond', weight: 700, size: h * 0.16, color: '#d9b06a', track: 0.04, maxW: w * 0.24 });
      text(ctx, 'ウイスキー', w * 0.75, h * 0.64, { family: 'Yuji Syuku', size: h * 0.18, color: '#d9b06a', maxW: w * 0.14 });
    });
  },

  // Estilo de reserva para produtos sem template próprio (equivale ao rótulo da versão 1).
  generico(p, kit) {
    const g = p.garrafa;
    kit.part('main', { t0: 0.15, t1: Math.max(0.36, g.ombro[0] - 0.05), arco: 66 }, (ctx, w, h) => {
      ctx.fillStyle = g.corRotulo;
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, hash(p.id), 0.04);
      ctx.strokeStyle = g.corTextoRotulo;
      ctx.lineWidth = 5;
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      text(ctx, (p.pais || '').toUpperCase(), w / 2, h * 0.16, { family: 'Archivo', weight: 700, size: h * 0.04, color: g.corTextoRotulo, track: 0.2 });
      text(ctx, p.nome, w / 2, h * 0.42, { family: 'Playfair Display', weight: 900, size: h * 0.14, color: g.corTextoRotulo, maxW: w * 0.82 });
      text(ctx, p.tipo || '', w / 2, h * 0.62, { family: 'Playfair Display', weight: 700, style: 'italic', size: h * 0.05, color: g.corTextoRotulo, maxW: w * 0.82 });
      text(ctx, [p.idade, ml(p), abv(p)].filter(Boolean).join(' · ').toUpperCase(), w / 2, h * 0.84, { family: 'Archivo', weight: 700, size: h * 0.035, color: g.corTextoRotulo, maxW: w * 0.82 });
    });
    kit.capsule((ctx, w, h) => {
      ctx.fillStyle = g.capsula.cor;
      ctx.fillRect(0, 0, w, h);
    });
  },
};

export const LABEL_STYLES = Object.keys(STYLES);

export function labelStyle(estilo) {
  return STYLES[estilo] ?? STYLES.generico;
}

// Etiqueta de preço da prateleira (região "tag"), no mesmo atlas: um draw call a menos.
// Mesma linguagem da interface: papel creme, faixa na cor da marca, preço em slab.
export function drawPriceTag(ctx, w, h, p, moeda) {
  ctx.fillStyle = '#faf7f1';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.rotulo.destaque;
  ctx.fillRect(0, 0, h * 0.16, h);
  ctx.fillStyle = '#a8874a';
  ctx.fillRect(h * 0.16, h * 0.9, w, h * 0.04);
  text(ctx, p.nome, h * 0.4, h * 0.36, { family: 'Libre Franklin', weight: 700, size: h * 0.3, color: '#24201c', align: 'left', maxW: w * 0.56 });
  text(ctx, `${p.volumeMl ?? ''} ml · ${String(p.teorAlcoolico).replace('.', ',')}% vol`.toUpperCase(), h * 0.4, h * 0.7, { family: 'Libre Franklin', weight: 500, size: h * 0.19, color: '#6b5f53', align: 'left', track: 0.08 });
  text(ctx, formatPrice(p.preco, moeda), w - h * 0.22, h * 0.48, { family: 'Zilla Slab', weight: 700, size: h * 0.5, color: '#24201c', align: 'right' });
}
