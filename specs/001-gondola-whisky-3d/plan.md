# Implementation Plan: Gôndola 3D de Whisky com Painel de Catálogo

**Branch**: `develop` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-gondola-whisky-3d/spec.md`

## Summary

Aplicação web estática (sem build) que renderiza, com three.js r186 em WebGL2, uma gôndola de
centro de loja com 1–2 módulos de 1 m, prateleiras de cerejeira laqueada, fundo ripado preto e
estrutura metálica — todos com texturas PBR do Poly Haven (cor + normal map OpenGL + ARM). A luz
principal (SpotLight) e uma luz de preenchimento (DirectionalLight) projetam sombras via shadow map
PCF; fitas LED sob cada prateleira usam `RectAreaLight` + faixa emissiva; um HDRI do Poly Haven dá
reflexos (IBL). Os 10 whiskies vêm de `data/whiskies.json`; um módulo puro (`src/core/layout.js`)
calcula o arranjo das prateleiras a partir dos produtos com `disponivel: true` não removidos na
sessão, e a cena anima a transição. Painel lateral (HTML/CSS) lista catálogo, detalhes e
disponibilidade; lil-gui controla a iluminação; camera-controls faz o enquadramento suave.
`serve.py` serve tudo localmente.

## Technical Context

**Language/Version**: JavaScript ES2022 (módulos nativos, `importmap`), HTML5, CSS3; Python 3.9+ (servidor)

**Primary Dependencies**: three.js 0.186.1 (+ addons HDRLoader, RectAreaLightUniformsLib, BufferGeometryUtils e lil-gui 0.17 que acompanha o three), camera-controls 3.1.2 — todos versionados em `vendor/`

**Storage**: Arquivo estático `data/whiskies.json` (somente leitura); estado de sessão em memória

**Testing**: `node --test` (Node 18+) para catálogo e arranjo; `python -m unittest` para `serve.py`; smoke test Playwright opcional (`tests/smoke.mjs`) com captura de tela

**Target Platform**: Navegadores desktop/tablet com WebGL2 (Chrome, Edge, Firefox, Safari 16+)

**Project Type**: Aplicação web estática (single project)

**Performance Goals**: ≥ 50 fps a 1080p em GPU integrada; carregamento ≤ 5 s em localhost

**Constraints**: Sem bundler; offline após clonar; ≤ 25 MB de assets; memória de texturas ≤ ~250 MB

**Scale/Scope**: 10 produtos, até 2 módulos, 10 prateleiras, ~100 garrafas instanciadas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano atende | Status |
|---|---|---|
| I. Dados dirigem a cena | Toda informação e aparência da garrafa vem do JSON; cena só lê `catalog` + `layout` | ✅ |
| II. Realismo físico (PBR) | 5 materiais Poly Haven com diff (sRGB) + nor_gl + arm (linear); ACES, IBL, shadow map | ✅ |
| III. Zero build | `importmap` → `vendor/`; `python serve.py`; assets locais | ✅ |
| IV. Lógica pura testável | `src/core/catalog.js` e `src/core/layout.js` sem three/DOM, testes `node --test` | ✅ |
| V. Performance | `InstancedMesh` por produto/peça, luzes fixas (intensidade varia), `shadowMap.autoUpdate=false` com atualização sob demanda, pixel ratio ≤ 2, `dispose()` ao reconstruir | ✅ |

**Re-check pós-design**: ✅ sem violações (ver data-model e contracts).

## Project Structure

### Documentation (this feature)

```text
specs/001-gondola-whisky-3d/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── whiskies.schema.json   # contrato do JSON de catálogo
│   └── modules.md             # contrato dos módulos puros (catalog/layout)
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
index.html                 # importmap, layout da página, painel, overlays
serve.py                   # servidor HTTP local (stdlib)
data/whiskies.json         # catálogo (10 produtos, campo disponivel)
assets/
├── textures/<id>/{diff,nor_gl,arm}.jpg   # Poly Haven CC0
├── hdri/brown_photostudio_02_1k.hdr
└── manifest.json
src/
├── main.js                # bootstrap: carrega catálogo, cria cena, liga UI ↔ cena
├── state.js               # estado de sessão (removidos, seleção) + eventos
├── core/                  # lógica pura (sem three/DOM)
│   ├── catalog.js         # parse/validação do JSON (RV-03)
│   └── layout.js          # algoritmo de arranjo (FR-007, FR-008, RV-01, RV-02)
├── scene/
│   ├── renderer.js        # WebGLRenderer, câmera, camera-controls, loop
│   ├── materials.js       # carregamento PBR Poly Haven + fallback
│   ├── environment.js     # HDRI, piso, parede
│   ├── lighting.js        # Spot/Directional com sombras, LEDs RectAreaLight
│   ├── gondola.js         # estrutura (base, colunas, fundo, prateleiras, cabeçote) + animação
│   ├── bottles.js         # geometria procedural por formato + InstancedMesh
│   ├── labels.js          # rótulos e tela do cabeçote via CanvasTexture
│   └── tween.js           # interpolação simples (easing)
└── ui/
    ├── panel.js           # painel lateral (catálogo, detalhe, filtros)
    ├── lightingGui.js     # lil-gui de iluminação
    └── styles.css
vendor/                    # three, addons, camera-controls (MIT)
scripts/fetch_polyhaven.py # reprodutibilidade dos assets
tests/
├── catalog.test.mjs
├── layout.test.mjs
├── test_serve.py
└── smoke.mjs              # Playwright (opcional)
```

**Structure Decision**: Projeto único estático na raiz; lógica pura em `src/core`, renderização em
`src/scene`, interface em `src/ui`, ligados por `src/state.js` (pub/sub mínimo).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Bibliotecas versionadas em `vendor/` (2,6 MB) | Rodar offline e sem `npm install` | CDN quebraria offline e travaria versões fora do repo |
