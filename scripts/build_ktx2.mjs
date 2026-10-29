// Converte as texturas JPG do Poly Haven em KTX2 (Basis Universal), que ficam comprimidas
// também na memória da GPU (dica 22 do guia de otimização: 4–8× menos VRAM que JPG/PNG).
//   diff   → ETC1S, sRGB (menor arquivo, ótimo para cor)
//   nor_gl → UASTC + RDO + Zstandard, modo normal map (sem artefatos de bloco no relevo)
//   arm    → ETC1S linear, qualidade alta (AO/roughness toleram ETC1S; UASTC aqui
//            ficava 8× maior para diferença invisível na cena)
// Os JPG continuam no repositório como fallback e como fonte deste script.
//
// Uso: npm i --no-save ktx2-encoder@0.6.0 && node scripts/build_ktx2.mjs [--force] [--maps=diff,arm]
// Requer Python 3 com Pillow para decodificar as imagens (scripts/decode_rgba.py).

import { encodeToKTX2 } from 'ktx2-encoder';
import { spawnSync } from 'node:child_process';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const texRoot = path.join(root, 'assets', 'textures');
const force = process.argv.includes('--force');
const only = process.argv.find((a) => a.startsWith('--maps='))?.slice(7).split(',');
const python = process.platform === 'win32' ? 'python' : 'python3';

const PRESETS = {
  diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isPerceptual: true },
  nor_gl: { isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 1, isPerceptual: false, isNormalMap: true, enableRDO: true, rdoQualityLevel: 1.5 },
  arm: { isUASTC: false, qualityLevel: 200, compressionLevel: 2, isPerceptual: false },
};

const exists = (p) => stat(p).then(() => true, () => false);

function decode(file) {
  const res = spawnSync(python, ['-I', path.join(root, 'scripts', 'decode_rgba.py'), file], { maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`falha ao decodificar ${file}: ${res.stderr}`);
  const [width, height] = res.stderr.toString().trim().split('x').map(Number);
  return { width, height, data: new Uint8Array(res.stdout.buffer, res.stdout.byteOffset, res.stdout.byteLength) };
}

for (const id of (await readdir(texRoot)).sort()) {
  for (const [map, preset] of Object.entries(PRESETS)) {
    if (only && !only.includes(map)) continue;
    const src = path.join(texRoot, id, `${map}.jpg`);
    const dst = path.join(texRoot, id, `${map}.ktx2`);
    if (!(await exists(src)) || (!force && (await exists(dst)))) continue;
    const img = decode(src);
    const t0 = performance.now();
    const ktx = await encodeToKTX2(img.data, {
      ...preset,
      generateMipmap: true,
      isYFlip: true, // three.js não inverte texturas comprimidas; equivale ao flipY do JPG
      imageDecoder: async () => img,
    });
    await writeFile(dst, ktx);
    const kib = (n) => `${Math.round(n / 1024)} KiB`;
    console.log(`${id}/${map}: ${img.width}² ${kib((await stat(src)).size)} → ${kib(ktx.length)} (${Math.round(performance.now() - t0)} ms)`);
  }
}
