---

description: "Task list for 002 — otimização, rótulos fiéis e country executivo"
---

# Tasks: Otimização, rótulos fiéis e interface country executiva

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)

**Tests**: incluídos (lógica pura + smoke + medição de desempenho).

## Phase 1: Setup

- [x] T101 Emendar a constituição para v1.1.0 (princípio VI, orçamento de draw calls, fontes OFL)
- [x] T102 Copiar o guia de otimização para `docs/referencias/otimizacao-threejs.md` e registrar a análise das fotos em `docs/referencias/rotulos.md`
- [x] T103 [P] Medir a linha de base da v1 com `tests/perf.mjs` (draw calls, triângulos, memória de textura)

## Phase 2: Foundational

- [x] T104 [P] Vendorizar fontes OFL (Cormorant Garamond, Libre Franklin, Zilla Slab, Archivo, IBM Plex Mono, Cinzel, Playfair Display, Rye, Pinyon Script, Cormorant Garamond, Yuji Syuku subset) em `assets/fonts/` com `fonts.css` e licenças — `scripts/fetch_fonts.py`
- [x] T105 [P] `scripts/build_ktx2.mjs`: JPG → KTX2 (ETC1S cor, UASTC normal/ARM) e geração dos `.ktx2`
- [x] T106 [P] Vendorizar `KTX2Loader` + dependências e o transcoder Basis em `vendor/three/addons/`
- [x] T107 `serve.py`: MIME `.ktx2`/`.woff2`, `no-store` só para `data/` e `src/`, revalidação (`no-cache`) para assets
- [x] T108 [P] Testes de `catalog.js` para garrafa estendida e `rotulo` (estilo, destaque, textos)
- [x] T109 Estender `data/whiskies.json` e `src/core/catalog.js` (ombro numérico, gargalo, fundo, tampa, cápsula, rótulo)
- [x] T110 [P] `tests/quality.test.mjs` + `src/core/quality.js` (níveis e histerese)

## Phase 3: US1 — Reconhecer cada whisky (P1)

- [x] T111 [US1] `src/scene/atlas.js` — atlas de cor/dados com regiões por produto e metalização automática do dourado
- [x] T112 [US1] `src/scene/labelArt.js` — 10 templates + genérico, a partir de `docs/referencias/rotulos.md`
- [x] T113 [US1] `src/scene/bottles.js` — geometria (cápsula, rolha de vidro, fundo grosso, peças de rótulo) e `BatchedMesh` opaco/vidro
- [x] T114 [US1] Vista de comparação `?lineup` e captura `docs/screenshots/05-comparacao-garrafas.png`

## Phase 4: US2 — Fluidez (P1)

- [x] T115 [US2] `gondola.js` — tampos/ferragens/LEDs em `InstancedMesh`, garrafas via `BatchedMesh`, módulos com metal fundido
- [x] T116 [US2] LEDs assados (lightmaps) + modo "LED realista" opcional
- [x] T117 [US2] Sombras: autoUpdate por luz, preenchimento sem sombra, frustum ajustado, `receiveShadow` seletivo
- [x] T118 [US2] `renderer.js` — transmissão 0.5, `compileAsync`, perda de contexto, qualidade adaptativa
- [x] T119 [US2] `materials.js` — KTX2 com fallback JPG
- [x] T120 [US2] `perfHud.js` (`?perf`) e `index.html` com `modulepreload`/`preload`

## Phase 5: US3 — Country sóbrio e executivo (P2)

> Revisão do cliente no meio da fase: o brutalismo (implementado e descartado) virou country
> sóbrio e executivo. As tarefas abaixo descrevem a versão final.

- [x] T121 [US3] `styles.css` reescrito (tokens de couro, linho, verde-floresta e latão; painel, cards, selos, botões, toast, loader, lil-gui)
- [x] T122 [US3] `panel.js` — número, cor de destaque, tabela de dados monoespaçada
- [x] T123 [US3] Tela do cabeçote redesenhada com as fontes locais

## Phase 6: US4 — Luz quente (P2)

- [x] T124 [US4] `lighting.js` — 2900 K na principal e nos LEDs, retroiluminação âmbar no fundo, hemisférica quente, exposição/ambiente recalibrados

## Phase 7: Polish

- [x] T125 Smoke test atualizado + `tests/perf.mjs` depois; tabela antes/depois no README
- [x] T126 README, `docs/engenharia-de-prompt.md` (iteração 2), commit e push para `develop`
