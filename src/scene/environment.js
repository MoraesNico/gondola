// Ambiente da loja: HDRI do Poly Haven para reflexos/luz ambiente (IBL), piso e parede.

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const ROOM = Object.freeze({ wallZ: -0.62, width: 9, height: 3.6, depth: 8 });

export async function createEnvironment({ renderer, scene, materials, manager }) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdr = await new HDRLoader(manager).loadAsync('assets/hdri/brown_photostudio_02_1k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose(); // o PMREM já guardou a versão filtrada
  } catch (err) {
    console.warn('[ambiente] HDRI indisponível — seguindo sem reflexos de ambiente', err);
  } finally {
    pmrem.dispose();
  }
  scene.environmentIntensity = 0.45;

  const group = new THREE.Group();
  group.name = 'loja';

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), materials.floor);
  floor.name = 'piso';
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = ROOM.wallZ + ROOM.depth / 2;
  scaleUV(floor.geometry, ROOM.width, ROOM.depth);
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), materials.wall);
  wall.name = 'parede';
  wall.position.set(0, ROOM.height / 2, ROOM.wallZ);
  scaleUV(wall.geometry, ROOM.width, ROOM.height);
  wall.receiveShadow = true;
  group.add(wall);

  // Rodapé de metal entre parede e piso
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(ROOM.width, 0.08, 0.015), materials.metal);
  skirting.position.set(0, 0.04, ROOM.wallZ + 0.008);
  skirting.receiveShadow = true;
  group.add(skirting);

  for (const m of group.children) {
    m.matrixAutoUpdate = false; // estático (dica de performance)
    m.updateMatrix();
  }
  scene.add(group);
  return group;
}

// UVs de PlaneGeometry vão de 0 a 1; convertendo para metros a repetição fica física.
function scaleUV(geometry, w, h) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
}
