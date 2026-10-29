// Garrafas procedurais de TODOS os produtos em apenas dois draw calls por passe
// (dicas 31–35 do guia): um BatchedMesh opaco (líquido, cápsula, rótulos e etiqueta de
// preço, texturizados por um atlas único) e um BatchedMesh de vidro transmissivo, cuja cor
// por produto vem de setColorAt (vidro verde do Jameson, transparente nos demais).
//
// A geometria é um "lathe" generalizado: perfil (raio × altura) girado sobre uma seção que
// pode ser círculo, superelipse (quadrada), frasco achatado ou polígono de 24 faces (Hibiki,
// com normais por faceta). Acima do ombro a seção vira círculo — o gargalo é sempre redondo.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LabelAtlas, SURFACES } from './atlas.js';
import { labelStyle, drawPriceTag } from './labelArt.js';

const LABEL_LIFT = 0.0009; // m — rótulo levemente afastado do vidro
const CAPSULE_LIFT = 0.0011;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Seção transversal unitária no ângulo θ (θ = π/2 aponta para +z, a frente da garrafa).
function section(shape, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (shape === 'quadrada' || shape === 'frasco') {
    const n = shape === 'quadrada' ? 7 : 2.8; // superelipse: n alto = cantos mais vivos
    const r = (Math.abs(c) ** n + Math.abs(s) ** n) ** (-1 / n);
    return [r * c, r * s];
  }
  if (shape === 'facetada') {
    const k = (Math.PI * 2) / 24;
    const local = ((theta % k) + k) % k - k / 2;
    const r = Math.cos(k / 2) / Math.cos(local);
    return [r * c, r * s];
  }
  return [c, s];
}

function makeProfile(g) {
  const [s0, s1] = g.ombro;
  const W = g.largura / 2;
  const neck = Math.min(0.7, g.raioGargalo / W);
  const glassTop = g.tampa === 'rolha-vidro' ? 0.88 : 0.97;
  const radius = (t) => {
    if (t < 0.012) return 0.9 + 0.1 * Math.sin((t / 0.012) * (Math.PI / 2));
    if (t <= s0) return 1;
    if (t <= s1) {
      const u = (t - s0) / (s1 - s0);
      return neck + (1 - neck) * (0.5 + 0.5 * Math.cos(Math.PI * u ** 0.85));
    }
    if (t >= glassTop - 0.025) return neck * 1.12; // anel do gargalo
    return neck;
  };
  // Anéis só onde há curvatura: corpo e gargalo são retos (2 anéis bastam), o ombro é denso.
  const ts = new Set([0, 0.006, 0.012, s0 * 0.5, s0, glassTop - 0.026, glassTop - 0.025, glassTop]);
  for (let i = 1; i <= 8; i++) ts.add(s0 + ((s1 - s0) * i) / 8);
  return { radius, s0, s1, neck, W, D: g.profundidade / 2, glassTop, samples: [...ts].filter((t) => t <= glassTop).sort((a, b) => a - b) };
}

// Ponto da superfície na altura t e ângulo θ, afastado `lift` metros para fora.
function surfacePoint(g, pr, t, theta, lift = 0, inset = 0, radiusAt = pr.radius) {
  const blend = smoothstep(pr.s0, pr.s1, t);
  const [sx, sz] = section(g.formato, theta);
  const x = THREE.MathUtils.lerp(sx, Math.cos(theta), blend);
  const z = THREE.MathUtils.lerp(sz, Math.sin(theta), blend);
  const depth = THREE.MathUtils.lerp(pr.D / pr.W, 1, blend);
  const r = Math.max(0.0005, radiusAt(t) * pr.W - inset) + lift;
  return [x * r, t * g.altura, z * (r - lift) * depth + z * lift];
}

// Largura física (m) de um arco ±arcDeg em torno da frente, na altura t.
function arcWidth(g, pr, t, arcDeg, center = 90) {
  const a0 = THREE.MathUtils.degToRad(center - arcDeg);
  const a1 = THREE.MathUtils.degToRad(center + arcDeg);
  let len = 0;
  let prev = surfacePoint(g, pr, t, a0);
  for (let i = 1; i <= 24; i++) {
    const p = surfacePoint(g, pr, t, a0 + ((a1 - a0) * i) / 24);
    len += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
    prev = p;
  }
  return len;
}

// Superfície de revolução genérica com UV fornecida por função (s ao redor, t na altura).
// `faceted` duplica as colunas nas arestas das 24 faces para normais por faceta.
function revolve(g, pr, { ts, segs, lift = 0, inset = 0, radiusAt, uvAt, colorAt, closeBottom = false, closeTop = false, capUV, faceted = false }) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const cols = faceted ? segs * 2 : segs + 1;
  const thetaOf = (k) => (faceted ? (Math.floor(k / 2) + (k % 2)) / segs : k / segs) * Math.PI * 2;
  ts.forEach((t, i) => {
    for (let k = 0; k < cols; k++) {
      const theta = thetaOf(k);
      positions.push(...surfacePoint(g, pr, t, theta, lift, inset, radiusAt));
      uvs.push(...uvAt(theta / (Math.PI * 2), t));
      if (colorAt) colors.push(...colorAt(t));
    }
    if (i === 0) return;
    const a = (i - 1) * cols;
    const b = i * cols;
    const quads = faceted ? segs : segs;
    for (let q = 0; q < quads; q++) {
      const k0 = faceted ? q * 2 : q;
      const k1 = faceted ? q * 2 + 1 : q + 1;
      indices.push(a + k0, b + k0, a + k1, a + k1, b + k0, b + k1);
    }
  });
  const disk = (ringIndex, up) => {
    const t = ts[ringIndex];
    const center = positions.length / 3;
    positions.push(0, t * g.altura, 0);
    uvs.push(...capUV);
    if (colorAt) colors.push(...colorAt(t));
    const start = ringIndex * cols;
    for (let q = 0; q < segs; q++) {
      const k0 = faceted ? q * 2 : q;
      const k1 = faceted ? q * 2 + 1 : q + 1;
      if (up) indices.push(center, start + k1, start + k0);
      else indices.push(center, start + k0, start + k1);
    }
  };
  if (closeBottom) disk(0, false);
  if (closeTop) disk(ts.length - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorAt) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (!faceted) fixSeam(geo, ts.length, cols);
  return geo;
}

// Costura em θ = 0/2π tem vértices duplicados; média das normais evita uma linha visível.
function fixSeam(geo, rings, cols) {
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const a = i * cols;
    const b = a + cols - 1;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
}

// Recorte do rótulo sobre a superfície, com UV na região do atlas.
function labelPatch(g, pr, part, toUV) {
  const arc = THREE.MathUtils.degToRad(part.arco);
  const center = THREE.MathUtils.degToRad(part.centro ?? 90);
  const cols = 20;
  const rows = part.t1 > pr.s0 ? 6 : 2; // mais linhas quando o rótulo sobe no ombro
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = part.t0 + ((part.t1 - part.t0) * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const theta = center - arc + (2 * arc * j) / cols;
      positions.push(...surfacePoint(g, pr, t, theta, part.lift ?? LABEL_LIFT));
      uvs.push(...toUV(1 - j / cols, i / rows)); // θ cresce para a esquerda vista de frente
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function tagGeometry(toUV) {
  const geo = new THREE.PlaneGeometry(0.17, 0.0213);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ...toUV(uv.getX(i), uv.getY(i)));
  return geo;
}

// Rolha de vidro facetada (Hibiki).
function stopperGeometry(g) {
  const r = 0.027;
  const y0 = g.altura * 0.86;
  const pts = [[0, y0], [r * 0.55, y0], [r * 0.55, y0 + 0.006], [r, y0 + 0.01], [r, g.altura - 0.006], [r * 0.85, g.altura], [0, g.altura]];
  const geo = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 24).toNonIndexed();
  geo.computeVertexNormals(); // não indexada → normal por triângulo → facetas nítidas
  const idx = [...Array(geo.attributes.position.count).keys()];
  geo.setIndex(idx);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(idx.length * 3).fill(1), 3));
  return geo;
}

// Disposição sobre a prateleira (coordenadas locais da prateleira).
export const SHELF_BOTTLE_AREA = Object.freeze({ width: 0.9, front: 0.15, gap: 0.016, rowGap: 0.022, rows: 2 });

function slots(g) {
  const { width, front, gap, rowGap, rows } = SHELF_BOTTLE_AREA;
  const facings = THREE.MathUtils.clamp(Math.floor((width + gap) / (g.largura + gap)), 3, 8);
  const span = facings * g.largura + (facings - 1) * gap;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < facings; i++) {
      out.push({ x: -span / 2 + g.largura / 2 + i * (g.largura + gap), z: front - g.profundidade / 2 - r * (g.profundidade + rowGap), row: r });
    }
  }
  return out;
}

function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const hash = (str) => [...str].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function buildProduct(p, cell, atlas, moeda) {
  const g = p.garrafa;
  const pr = makeProfile(g);
  const faceted = g.formato === 'facetada';
  const segs = faceted ? 24 : 28;
  const parts = [];

  const kit = {
    SURFACES,
    part(region, spec, draw, opts) {
      const physW = arcWidth(g, pr, (spec.t0 + spec.t1) / 2, spec.arco, spec.centro);
      const physH = (spec.t1 - spec.t0) * g.altura;
      atlas.paint(cell, region, physW, physH, draw, opts);
      parts.push(labelPatch(g, pr, spec, (s, t) => atlas.uv(cell, region, s, t)));
    },
    capsule(draw, opts = {}) {
      kit._capsuleDrawn = true;
      const c = g.capsula;
      const t1 = g.tampa === 'rolha-vidro' ? Math.min(c.inicio + 0.065, pr.glassTop - 0.005) : 1;
      const physW = arcWidth(g, pr, (c.inicio + t1) / 2, 180);
      atlas.paint(cell, 'caps', physW, (t1 - c.inicio) * g.altura, draw, { surface: c.metalica ? SURFACES.capsulaMetal : SURFACES.capsula, ...opts });
      kit._capsuleT1 = t1;
    },
  };
  labelStyle(p.rotulo.estilo)(p, kit);
  if (!kit._capsuleDrawn) kit.capsule((ctx, w, h) => ((ctx.fillStyle = g.capsula.cor), ctx.fillRect(0, 0, w, h)));

  // O whisky é o próprio vidro transmissivo tingido (cor por vértice) entre o fundo grosso e a
  // linha de enchimento: o fundo da loja aparece através do âmbar, como na foto do produto.
  const capTopUV = atlas.solid(cell, 1, g.capsula.cor, g.capsula.metalica ? SURFACES.capsulaMetal : SURFACES.capsula);
  const fill = Math.min(pr.s1 + 0.03, g.capsula.inicio - 0.01, pr.glassTop - 0.05);
  const whisky = new THREE.Color(g.corLiquido);
  const clear = [1, 1, 1];
  const tint = [whisky.r, whisky.g, whisky.b];
  const glassColor = (t) => (t > g.fundo && t <= fill ? tint : clear);

  // Cápsula: acompanha o vidro e, acima do anel, vira a tampa; rolha de vidro = só a gargantilha.
  const c0 = g.capsula.inicio;
  const c1 = kit._capsuleT1;
  const capRadius = (t) => Math.max(pr.radius(t), t > pr.s1 ? pr.neck * 1.13 : 0);
  const capTs = [...new Set([c0, ...pr.samples.filter((t) => t > c0 && t < c1), Math.min(c1, pr.glassTop - 0.026), Math.min(c1, pr.glassTop), c1])].sort((a, b) => a - b);
  const capsule = revolve(g, pr, {
    ts: capTs, segs: 24, lift: CAPSULE_LIFT, radiusAt: capRadius,
    // 1 − θ/2π: a arte não sai espelhada e a frente (θ = 90°) fica em s = 0,75
    uvAt: (s, t) => atlas.uv(cell, 'caps', 1 - s, (t - c0) / (c1 - c0)),
    closeTop: g.tampa !== 'rolha-vidro', capUV: capTopUV,
  });

  atlas.paint(cell, 'tag', 0.17, 0.0213, (ctx, w, h) => drawPriceTag(ctx, w, h, p, moeda), { surface: SURFACES.papel, foil: false });
  const tag = tagGeometry((s, t) => atlas.uv(cell, 'tag', s, t));

  // Anéis extras colados ao fundo e à linha de enchimento deixam a transição de cor nítida.
  const eps = 0.0015;
  const glassTs = [...new Set([...pr.samples, g.fundo, g.fundo + eps, fill, fill + eps])].filter((t) => t <= pr.glassTop).sort((a, b) => a - b);
  const glassParts = [revolve(g, pr, { ts: glassTs, segs, uvAt: (s, t) => [s, t], colorAt: glassColor, closeBottom: true, capUV: [0.5, 0], faceted })];
  if (g.tampa === 'rolha-vidro') glassParts.push(stopperGeometry(g));

  const opaque = mergeGeometries([capsule, ...parts]);
  const glass = glassParts.length > 1 ? mergeGeometries(glassParts) : glassParts[0];
  [capsule, ...parts, ...glassParts].forEach((x) => x !== glass && x.dispose());
  return { p, opaque, glass, tag, slots: slots(g), height: g.altura };
}

// ---------------------------------------------------------------- sistema de garrafas

export function createBottleSystem(produtos, { moeda, tagPosition, maxAnisotropy = 8 }) {
  const atlas = new LabelAtlas(produtos.length);
  const items = produtos.map((p, cell) => buildProduct(p, cell, atlas, moeda));
  const tex = atlas.textures(maxAnisotropy);

  const opaqueMat = new THREE.MeshPhysicalMaterial({
    name: 'rotulos-capsulas',
    map: tex.map,
    roughnessMap: tex.data, // G
    metalnessMap: tex.data, // B
    clearcoatMap: tex.data, // R
    roughness: 1,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    alphaTest: 0.5, // recortes (papel rasgado, escudos, impressão no vidro) sem transparência
  });
  // Vidro + whisky: a cor por vértice tinge a luz transmitida; a cor por instância é a do vidro.
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'vidro-whisky',
    color: '#ffffff',
    vertexColors: true,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 0.02,
    ior: 1.45,
    specularIntensity: 1,
    envMapIntensity: 1.6,
  });

  const sum = (fn) => items.reduce((s, it) => s + fn(it), 0);
  const verts = (geo) => geo.attributes.position.count;
  const idx = (geo) => geo.index.count;
  const nBottles = sum((it) => it.slots.length);
  const opaque = new THREE.BatchedMesh(nBottles + items.length, sum((it) => verts(it.opaque) + verts(it.tag)), sum((it) => idx(it.opaque) + idx(it.tag)), opaqueMat);
  const glass = new THREE.BatchedMesh(nBottles, sum((it) => verts(it.glass)), sum((it) => idx(it.glass)), glassMat);
  opaque.name = 'garrafas-opaco';
  glass.name = 'garrafas-vidro';
  for (const m of [opaque, glass]) {
    m.sortObjects = false; // ordenar 150 instâncias a cada passe custa CPU e não ajuda aqui
    m.frustumCulled = false; // a esfera do lote mudaria a cada rearranjo; o culling por objeto segue ativo
    m.receiveShadow = true;
  }
  opaque.castShadow = true;
  glass.castShadow = true; // garrafa cheia projeta sombra quase sólida

  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const white = new THREE.Color(1, 1, 1);
  const byId = new Map();
  const ownerOpaque = [];
  const ownerGlass = [];

  for (const it of items) {
    const r = seeded(hash(it.p.id));
    const gOpaque = opaque.addGeometry(it.opaque);
    const gTag = opaque.addGeometry(it.tag);
    const gGlass = glass.addGeometry(it.glass);
    const glassColor = new THREE.Color(it.p.garrafa.corVidro);
    const entry = { item: it, locals: [], opaqueIds: [], glassIds: [], tagId: null, tagLocal: new THREE.Matrix4().makeTranslation(tagPosition) };
    for (const s of it.slots) {
      const q = new THREE.Quaternion().setFromAxisAngle(up, (r() - 0.5) * (s.row ? 0.16 : 0.08));
      entry.locals.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + (r() - 0.5) * 0.004, 0, s.z), q, one));
      const o = opaque.addInstance(gOpaque);
      const v = glass.addInstance(gGlass);
      opaque.setColorAt(o, white);
      glass.setColorAt(v, glassColor);
      ownerOpaque[o] = it.p.id;
      ownerGlass[v] = it.p.id;
      entry.opaqueIds.push(o);
      entry.glassIds.push(v);
    }
    entry.tagId = opaque.addInstance(gTag);
    opaque.setColorAt(entry.tagId, white);
    ownerOpaque[entry.tagId] = it.p.id;
    byId.set(it.p.id, entry);
    it.opaque.dispose();
    it.tag.dispose();
    it.glass.dispose();
  }

  const m = new THREE.Matrix4();
  const highlight = new THREE.Color(1.18, 1.14, 1.08);

  return {
    meshes: [opaque, glass],
    textures: tex,
    heightOf: (id) => byId.get(id)?.item.height ?? 0.3,

    // Posiciona as garrafas e a etiqueta de um produto segundo a matriz da prateleira.
    setShelf(id, shelfMatrix, visible) {
      const e = byId.get(id);
      if (!e) return;
      e.locals.forEach((local, i) => {
        m.multiplyMatrices(shelfMatrix, local);
        opaque.setMatrixAt(e.opaqueIds[i], m);
        glass.setMatrixAt(e.glassIds[i], m);
        opaque.setVisibleAt(e.opaqueIds[i], visible);
        glass.setVisibleAt(e.glassIds[i], visible);
      });
      opaque.setMatrixAt(e.tagId, m.multiplyMatrices(shelfMatrix, e.tagLocal));
      opaque.setVisibleAt(e.tagId, visible);
    },

    // Vista de comparação (?lineup): só a primeira garrafa do produto, na matriz dada.
    setSingle(id, matrix) {
      const e = byId.get(id);
      if (!e) return;
      e.opaqueIds.forEach((o, i) => {
        opaque.setVisibleAt(o, i === 0);
        glass.setVisibleAt(e.glassIds[i], i === 0);
      });
      opaque.setMatrixAt(e.opaqueIds[0], matrix);
      glass.setMatrixAt(e.glassIds[0], matrix);
      opaque.setVisibleAt(e.tagId, false);
    },

    setHighlight(id, on) {
      const e = byId.get(id);
      if (!e) return;
      for (const o of e.opaqueIds) opaque.setColorAt(o, on ? highlight : white);
    },

    productAt(hit) {
      if (hit?.batchId == null) return null;
      return (hit.object === opaque ? ownerOpaque : ownerGlass)[hit.batchId] ?? null;
    },
  };
}
