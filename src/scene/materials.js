// Materiais PBR com texturas fotorrealistas do Poly Haven (CC0).
// Cada conjunto tem: diff (cor, sRGB), nor_gl (normal map, convenção OpenGL) e arm
// (AO no R, roughness no G, metalness no B — os canais que o three.js lê).
// Formato preferido: KTX2 (Basis Universal), que continua comprimido na memória da GPU
// (dica 22 do guia: 4–8× menos VRAM). Se o transcodificador falhar, cai para o JPG.

import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const TEXTURE_ROOT = 'assets/textures';

// metersPerTile: tamanho físico que uma repetição da textura cobre.
const SETS = {
  wood: { id: 'lacquered_cherry_wood', metersPerTile: 1.1, fallback: '#5a2a1a' },
  planks: { id: 'black_painted_planks', metersPerTile: 1.6, fallback: '#1b1b1b', rotate: true },
  metal: { id: 'blue_metal_plate', metersPerTile: 0.6, fallback: '#2c2e31' },
  floor: { id: 'marble_01', metersPerTile: 2.4, fallback: '#cfc6b6' },
  wall: { id: 'painted_plaster_wall', metersPerTile: 2.5, fallback: '#b9b1a5' },
};

function prepare(tex, colorSpace, maxAnisotropy) {
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

async function loadSet(loaders, { id }, maxAnisotropy) {
  const load = async (name, colorSpace) => {
    const base = `${TEXTURE_ROOT}/${id}/${name}`;
    if (loaders.ktx2) {
      try {
        return prepare(await loaders.ktx2.loadAsync(`${base}.ktx2`), colorSpace, maxAnisotropy);
      } catch (err) {
        console.warn(`[materiais] KTX2 indisponível para ${id}/${name} — usando JPG`, err);
      }
    }
    try {
      return prepare(await loaders.jpg.loadAsync(`${base}.jpg`), colorSpace, maxAnisotropy);
    } catch (err) {
      console.warn(`[materiais] falha ao carregar ${id}/${name} — usando cor sólida`, err);
      return null;
    }
  };
  const [map, normalMap, arm] = await Promise.all([
    load('diff', THREE.SRGBColorSpace), // só cor em sRGB…
    load('nor_gl', THREE.NoColorSpace), // …mapas de dados ficam lineares
    load('arm', THREE.NoColorSpace),
  ]);
  return { map, normalMap, arm };
}

// Cópia com repetição própria. Clones compartilham o mesmo `Source`, então a imagem é enviada
// à GPU uma única vez (dica: reutilize texturas).
function tiled(tex, metersPerTile, rotate) {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
  if (rotate) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  return t;
}

function texturesFor(textures, key, { scale = 1, use = ['map', 'normalMap', 'arm'] } = {}) {
  const def = SETS[key];
  const set = textures[key];
  const m = def.metersPerTile * scale;
  const out = {};
  if (use.includes('map') && set.map) out.map = tiled(set.map, m, def.rotate);
  if (use.includes('normalMap') && set.normalMap) out.normalMap = tiled(set.normalMap, m, def.rotate);
  if (use.includes('arm') && set.arm) {
    const arm = tiled(set.arm, m, def.rotate);
    out.aoMap = arm;
    out.roughnessMap = arm;
  }
  return out;
}

// `?textures=jpg` força os JPG (útil para comparar memória e qualidade).
export async function createMaterials(renderer, manager, { preferKtx2 = true } = {}) {
  const loaders = { jpg: new THREE.TextureLoader(manager), ktx2: null };
  if (preferKtx2) {
    try {
      loaders.ktx2 = new KTX2Loader(manager).setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer);
    } catch (err) {
      console.warn('[materiais] KTX2Loader indisponível — usando JPG', err);
    }
  }
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const entries = await Promise.all(Object.entries(SETS).map(async ([k, def]) => [k, await loadSet(loaders, def, maxAniso)]));
  loaders.ktx2?.dispose(); // encerra os workers do transcodificador (dica 37)
  const textures = Object.fromEntries(entries);
  const has = (k) => Boolean(textures[k].map);

  const wood = new THREE.MeshPhysicalMaterial({
    name: 'cerejeira-laqueada',
    color: has('wood') ? '#ffffff' : SETS.wood.fallback,
    roughness: 0.85,
    metalness: 0,
    clearcoat: 0.55, // verniz
    clearcoatRoughness: 0.18,
    ...texturesFor(textures, 'wood'),
  });
  wood.normalScale.set(0.6, 0.6);

  const planks = new THREE.MeshStandardMaterial({
    name: 'ripado-preto',
    color: has('planks') ? '#ffffff' : SETS.planks.fallback,
    roughness: 1,
    metalness: 0,
    ...texturesFor(textures, 'planks'),
  });

  // Metal: só normal + roughness/AO do Poly Haven, com cor grafite (o diffuse original é azul).
  const metal = new THREE.MeshStandardMaterial({
    name: 'aco-grafite',
    color: '#34373b',
    roughness: 0.75,
    metalness: 0.85,
    ...texturesFor(textures, 'metal', { use: ['normalMap', 'arm'] }),
  });
  metal.normalScale.set(0.5, 0.5);

  const metalBrushed = metal.clone();
  metalBrushed.name = 'aco-claro';
  metalBrushed.color.set('#9a9ea3');
  metalBrushed.roughness = 0.5;

  const floor = new THREE.MeshStandardMaterial({
    name: 'marmore',
    color: has('floor') ? '#ffffff' : SETS.floor.fallback,
    roughness: 0.55, // multiplica o roughness do mapa: piso polido
    metalness: 0,
    envMapIntensity: 1.2,
    ...texturesFor(textures, 'floor'),
  });

  const wall = new THREE.MeshStandardMaterial({
    name: 'reboco',
    color: has('wall') ? '#ead3b8' : SETS.wall.fallback, // reboco em tom quente
    roughness: 1,
    metalness: 0,
    ...texturesFor(textures, 'wall'),
  });

  return { wood, planks, metal, metalBrushed, floor, wall, textures };
}

// Reescreve as UVs de uma BoxGeometry em metros, para que `repeat = 1/metersPerTile`
// produza a mesma escala de textura em todas as faces, sem esticar.
export function worldBoxUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z, y);
    else if (ay >= az) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function box(w, h, d) {
  return worldBoxUV(new THREE.BoxGeometry(w, h, d));
}
