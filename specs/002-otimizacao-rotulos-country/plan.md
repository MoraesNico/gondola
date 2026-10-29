# Implementation Plan: Otimização, rótulos fiéis e interface country executiva

**Branch**: `develop` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

## Summary

Reescrever o pipeline de garrafas para **um `BatchedMesh` opaco + um `BatchedMesh` de vidro**
para todos os produtos, com um **atlas único** (cor + dados de material) desenhado por
**templates de rótulo por marca** baseados nas fotos de referência. A estrutura da gôndola
passa a usar `InstancedMesh` (tampos, ferragens, fitas LED). Os LEDs viram **lightmaps
assados** regenerados a cada rearranjo (RectAreaLight vira modo opcional). Texturas Poly Haven
em **KTX2** (ETC1S para cor e ARM, UASTC + RDO para normal map) com fallback JPG. Shaders pré-compilados
com `compileAsync`, tratamento de perda de contexto, qualidade adaptativa, `?perf` com HUD.
Interface country sóbria e executiva com Cormorant Garamond, Libre Franklin e Zilla Slab (OFL,
locais) — revisão pedida pelo cliente durante a implementação (antes: brutalismo). Luz quente (≈ 2900 K) com retroiluminação âmbar no fundo ripado.

## Technical Context

**Language/Version**: JavaScript ES2022 (módulos nativos), HTML5, CSS3; Python 3.9+

**Primary Dependencies**: three.js 0.186.1 (+ KTX2Loader, basis transcoder, BufferGeometryUtils, HDRLoader, RectAreaLightUniformsLib, lil-gui), camera-controls 3.1.2; build de assets: `ktx2-encoder` 0.6 (npm, só para gerar os `.ktx2`) + Pillow

**Testing**: `node --test`, `unittest`, Playwright (`tests/smoke.mjs`, `tests/perf.mjs`)

**Performance Goals**: ≤ 100 draw calls/quadro; ≥ 50% menos memória de textura; 60 fps em GPU integrada

**Constraints**: zero build para rodar; offline; fotos de referência não versionadas

## Constitution Check (v1.1.0)

| Princípio | Atendimento | Status |
|---|---|---|
| I. Dados dirigem a cena | garrafa/cápsula/rótulo (`estilo`, textos, cores) no JSON; templates só desenham | ✅ |
| II. PBR | atlas de dados (clearcoat/roughness/metalness) para papel, foil, cápsula e líquido; KTX2 mantém normal/ARM | ✅ |
| III. Zero build | `.ktx2` e fontes versionados; o encoder só roda para regenerar | ✅ |
| IV. Lógica pura | normalização da garrafa/rótulo em `catalog.js`, níveis de qualidade em `core/quality.js`, testados | ✅ |
| V. Performance | BatchedMesh, InstancedMesh, KTX2, LEDs assados, sombras seletivas, compileAsync, adaptativo, números antes/depois | ✅ |
| VI. Fidelidade | templates por marca seguindo `docs/referencias/rotulos.md`; fotos não usadas como textura | ✅ |

## Project Structure

```text
assets/fonts/                 # woff2 OFL + fonts.css + OFL.txt
assets/textures/<id>/*.ktx2   # gerados por scripts/build_ktx2.mjs (JPG fica como fallback)
vendor/three/addons/loaders/KTX2Loader.js (+ utils/WorkerPool.js, libs/ktx-parse, libs/zstddec)
vendor/three/addons/libs/basis/  # transcoder wasm
src/core/quality.js           # níveis de qualidade + histerese (puro, testado)
src/scene/labelArt.js         # templates de rótulo por marca (canvas)
src/scene/atlas.js            # atlas de cor + atlas de dados, regiões por produto
src/scene/bottles.js          # geometrias + BatchedMesh opaco/vidro
src/scene/gondola.js          # InstancedMesh da estrutura + lightmaps de LED
src/scene/perfHud.js          # ?perf
src/ui/styles.css             # country executivo
scripts/build_ktx2.mjs        # JPG → KTX2
tests/quality.test.mjs, tests/perf.mjs
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `devDependency` ktx2-encoder | gerar KTX2 sem binários nativos (GitHub Releases bloqueado no ambiente) | KTX-Software CLI indisponível; os `.ktx2` ficam versionados, então rodar o projeto não exige nada |
