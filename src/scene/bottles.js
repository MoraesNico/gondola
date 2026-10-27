// Garrafas procedurais: um "lathe" generalizado em que o perfil (raio × altura) é girado
// sobre uma seção transversal que pode ser círculo, superelipse quadrada, frasco achatado ou
// polígono de 24 faces. Acima do ombro a seção se funde num círculo (gargalo sempre redondo).
// Cada produto vira 4 InstancedMesh (vidro, líquido, tampa, rótulo) → poucas draw calls.

import * as THREE from 'three';
import { makeLabelTexture } from './labels.js';

const NECK_RADIUS = 0.0135; // m
const SHOULDERS = { alto: [0.7, 0.8], medio: [0.6, 0.74], baixo: [0.52, 0.7] };
const LABEL_ARC = { redonda: 70, frasco: 58, quadrada: 43, facetada: 62 }; // meia-abertura em graus
const CAP_START = 0.86;
const GLASS_TOP = 0.965;

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
  const [s0, s1] = SHOULDERS[g.ombro] ?? SHOULDERS.medio;
  const neck = Math.min(0.6, NECK_RADIUS / (g.largura / 2));
  const radius = (t) => {
    if (t < 0.012) return 0.9 + 0.1 * Math.sin((t / 0.012) * (Math.PI / 2));
    if (t <= s0) return 1;
    if (t <= s1) {
      const u = (t - s0) / (s1 - s0);
      return neck + (1 - neck) * (0.5 + 0.5 * Math.cos(Math.PI * u ** 0.85));
    }
    if (t >= 0.945 && t <= GLASS_TOP) return neck * 1.18; // anel do gargalo
    return neck;
  };
  // Anéis só onde há curvatura: corpo e gargalo são retos (2 anéis bastam), o ombro é denso.
  // Menos vértices × ~150 garrafas × 4 passes (cena, 2 sombras, transmissão) = muito menos GPU.
  const ts = new Set([0, 0.006, 0.012, s0 * 0.5, s0]);
  for (let i = 1; i <= 10; i++) ts.add(s0 + ((s1 - s0) * i) / 10);
  [0.945, 0.946, 0.964, GLASS_TOP].forEach((t) => ts.add(t));
  return { radius, s0, s1, neck, samples: [...ts].sort((a, b) => a - b) };
}

// Superfície de revolução generalizada. `inset` encolhe o raio (líquido dentro do vidro).
function revolve(g, profile, { tFrom = 0, tTo = GLASS_TOP, inset = 0, closeTop = false, radial }) {
  const segs = radial ?? (g.formato === 'facetada' ? 24 : 32);
  const W = g.largura / 2;
  const D = g.profundidade / 2;
  const ts = profile.samples.filter((t) => t >= tFrom && t <= tTo);
  if (ts[0] > tFrom) ts.unshift(tFrom);
  if (ts[ts.length - 1] < tTo) ts.push(tTo);

  const positions = [];
  const uvs = [];
  const indices = [];
  const point = (t, theta, extra = 0) => {
    const blend = smoothstep(profile.s0, profile.s1, t);
    const [sx, sz] = section(g.formato, theta);
    const x = THREE.MathUtils.lerp(sx, Math.cos(theta), blend);
    const z = THREE.MathUtils.lerp(sz, Math.sin(theta), blend);
    const depthScale = THREE.MathUtils.lerp(D / W, 1, blend);
    const r = Math.max(0.0005, profile.radius(t) * W - inset) + extra;
    return [x * r, t * g.altura, z * r * depthScale];
  };

  ts.forEach((t, i) => {
    for (let j = 0; j <= segs; j++) {
      const theta = (j / segs) * Math.PI * 2;
      positions.push(...point(t, theta));
      uvs.push(j / segs, t);
    }
    if (i > 0) {
      const a = (i - 1) * (segs + 1);
      const b = i * (segs + 1);
      for (let j = 0; j < segs; j++) indices.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    }
  });

  // Fundo (e topo, para o líquido) fechados em leque.
  const cap = (t, ringStart, up) => {
    const center = positions.length / 3;
    positions.push(0, t * g.altura, 0);
    uvs.push(0.5, t);
    for (let j = 0; j < segs; j++) {
      if (up) indices.push(center, ringStart + j + 1, ringStart + j);
      else indices.push(center, ringStart + j, ringStart + j + 1);
    }
  };
  cap(ts[0], 0, false);
  if (closeTop) cap(ts[ts.length - 1], (ts.length - 1) * (segs + 1), true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  fixSeamNormals(geo, ts.length, segs);
  return geo;
}

// A costura (θ = 0 e θ = 2π) tem vértices duplicados; media as normais para não aparecer linha.
function fixSeamNormals(geo, rings, segs) {
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const a = i * (segs + 1);
    const b = a + segs;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
}

// Recorte da superfície do corpo, levemente afastado do vidro, com UV 0–1 para o canvas.
function labelGeometry(g, profile) {
  const arc = THREE.MathUtils.degToRad(LABEL_ARC[g.formato] ?? 60);
  const t0 = 0.15;
  const t1 = Math.max(t0 + 0.2, profile.s0 - 0.05);
  const cols = 20;
  const rows = 4;
  const W = g.largura / 2;
  const D = g.profundidade / 2;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = t0 + ((t1 - t0) * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const theta = Math.PI / 2 - arc + (2 * arc * j) / cols;
      const [sx, sz] = section(g.formato, theta);
      const r = W + 0.0009;
      positions.push(sx * r, t * g.altura, sz * r * (D / W) + (sz > 0 ? 0.0004 : 0));
      uvs.push(1 - j / cols, i / rows);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1); // normal para fora
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function capGeometry(g) {
  const r = NECK_RADIUS * 1.25;
  const h = g.altura * (1 - CAP_START);
  const pts = [
    [0, 0], [r * 0.96, 0], [r, 0.003], [r, h - 0.004], [r * 0.92, h - 0.0005], [r * 0.6, h], [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.translate(0, g.altura * CAP_START, 0);
  return geo;
}

function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const hash = (str) => [...str].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

// Disposição das garrafas sobre uma prateleira (coordenadas locais da prateleira).
export const SHELF_BOTTLE_AREA = Object.freeze({ width: 0.9, front: 0.15, gap: 0.016, rowGap: 0.022, rows: 2 });

function slots(g) {
  const { width, front, gap, rowGap, rows } = SHELF_BOTTLE_AREA;
  const facings = THREE.MathUtils.clamp(Math.floor((width + gap) / (g.largura + gap)), 3, 8);
  const span = facings * g.largura + (facings - 1) * gap;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < facings; i++) {
      out.push({
        x: -span / 2 + g.largura / 2 + i * (g.largura + gap),
        z: front - g.profundidade / 2 - r * (g.profundidade + rowGap),
        row: r,
      });
    }
  }
  return out;
}

export function createProductBottles(produto, { envIntensity = 1 } = {}) {
  const g = produto.garrafa;
  const profile = makeProfile(g);
  const faceted = g.formato === 'facetada';
  const fill = Math.min(profile.s0 + 0.05, 0.8);

  const glassMat = new THREE.MeshPhysicalMaterial({
    name: `vidro-${produto.id}`,
    color: g.corVidro,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 0.006,
    ior: 1.5,
    attenuationColor: new THREE.Color(g.corVidro),
    attenuationDistance: 0.08,
    specularIntensity: 1,
    envMapIntensity: 1.4 * envIntensity,
    flatShading: faceted,
  });
  // O passe de transmissão do three.js só "enxerga" objetos opacos, por isso o líquido é opaco.
  const liquidMat = new THREE.MeshPhysicalMaterial({
    name: `liquido-${produto.id}`,
    color: new THREE.Color(g.corLiquido).multiplyScalar(0.62), // matiz do JSON, mais denso
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: new THREE.Color(g.corLiquido).multiplyScalar(0.015),
    flatShading: faceted,
  });
  const capColor = new THREE.Color(g.corTampa);
  const capHsl = capColor.getHSL({});
  const capMat = new THREE.MeshStandardMaterial({
    name: `tampa-${produto.id}`,
    color: capColor,
    roughness: 0.38,
    metalness: capHsl.l > 0.45 && capHsl.s < 0.6 ? 0.9 : 0.15, // tampas claras = metalizadas
  });
  const labelMat = new THREE.MeshStandardMaterial({
    name: `rotulo-${produto.id}`,
    map: makeLabelTexture(produto),
    roughness: 0.62,
    metalness: 0,
    alphaTest: 0.5, // dica: alphaTest em vez de transparência
    emissive: '#000000',
  });

  const geos = {
    glass: revolve(g, profile, {}),
    liquid: revolve(g, profile, { tFrom: 0.018, tTo: fill, inset: 0.0022, closeTop: true }),
    cap: capGeometry(g),
    label: labelGeometry(g, profile),
  };

  const places = slots(g);
  const group = new THREE.Group();
  group.name = `garrafas-${produto.id}`;
  const meshes = {};
  const parts = [
    ['liquid', liquidMat, true],
    ['label', labelMat, true],
    ['cap', capMat, true],
    ['glass', glassMat, false], // vidro transmissivo não projeta sombra sólida
  ];
  const rand = seeded(hash(produto.id));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const matrices = places.map((p) => {
    q.setFromAxisAngle(up, (rand() - 0.5) * (p.row ? 0.16 : 0.08));
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x + (rand() - 0.5) * 0.004, 0, p.z), q, one);
  });

  for (const [key, mat, cast] of parts) {
    const mesh = new THREE.InstancedMesh(geos[key], mat, places.length);
    matrices.forEach((mx, i) => mesh.setMatrixAt(i, m.copy(mx)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.userData.productId = produto.id;
    mesh.name = `${key}-${produto.id}`;
    meshes[key] = mesh;
    group.add(mesh);
  }

  return {
    group,
    meshes,
    height: g.altura,
    count: places.length,
    setHighlight(on) {
      labelMat.emissive.set(on ? '#3a2a14' : '#000000');
      liquidMat.emissive.set(g.corLiquido).multiplyScalar(on ? 0.16 : 0.015);
    },
    dispose() {
      Object.values(geos).forEach((x) => x.dispose());
      labelMat.map.dispose();
      [glassMat, liquidMat, capMat, labelMat].forEach((x) => x.dispose());
    },
  };
}
