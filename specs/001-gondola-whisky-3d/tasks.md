---

description: "Task list for Gôndola 3D de Whisky"
---

# Tasks: Gôndola 3D de Whisky com Painel de Catálogo

**Input**: Design documents from `/specs/001-gondola-whisky-3d/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Incluídos para a lógica pura (constituição, princípio IV) e para o servidor.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 vitrine 3D · US2 catálogo · US3 arranjo automático · US4 iluminação

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Inicializar Spec Kit (`specify init --here --integration claude`) e constituição em `.specify/memory/constitution.md`
- [x] T002 Criar branch `develop` e estrutura de pastas do plan.md
- [x] T003 [P] Vendorizar three.js 0.186.1, addons e camera-controls 3.1.2 em `vendor/`
- [x] T004 [P] Script `scripts/fetch_polyhaven.py` e download das texturas/HDRI para `assets/`
- [x] T005 [P] `serve.py` (ThreadingHTTPServer, MIME, no-store, `--port`, `--no-browser`)
- [x] T006 [P] `tests/test_serve.py` (inicia servidor em porta livre, confere MIME de `.js`, `.json`, `.hdr`)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T007 `data/whiskies.json` com os 10 produtos e campo `disponivel` (Hibiki = false) conforme contracts/whiskies.schema.json
- [x] T008 [P] `tests/catalog.test.mjs` — RV-03: campos obrigatórios, tipos, ids duplicados, defaults de garrafa, JSON real válido
- [x] T009 `src/core/catalog.js` — `parseCatalog` até os testes de T008 passarem
- [x] T010 [P] `tests/layout.test.mjs` — invariantes 1–6 de contracts/modules.md
- [x] T011 `src/core/layout.js` — `eligibleProducts`, `computeLayout`, `canRemove` até T010 passar
- [x] T012 `src/state.js` — estado de sessão (removidos, seleção, filtro) + emissor de eventos
- [x] T013 `index.html` com importmap (`three`, `three/addons/`, `camera-controls`), contêiner do canvas, painel e overlays de carregamento/erro

**Checkpoint**: lógica pura testada; página carrega sem cena.

---

## Phase 3: User Story 1 - Visualizar a gôndola fotorrealista (P1) 🎯 MVP

**Goal**: gôndola PBR com sombras e garrafas procedurais.

**Independent Test**: quickstart passos 1–2.

- [x] T014 [P] [US1] `src/scene/renderer.js` — WebGLRenderer (ACES, sRGB, pixel ratio ≤ 2, shadow map PCF), câmera, camera-controls com limites, loop, resize
- [x] T015 [P] [US1] `src/scene/materials.js` — loader PBR (diff sRGB, nor_gl, arm → ao/rough), repetição por tamanho físico via `clone()`, anisotropia, fallback para cor sólida
- [x] T016 [P] [US1] `src/scene/environment.js` — HDRI via HDRLoader + PMREM (`scene.environment`), piso de mármore, parede de reboco
- [x] T017 [US1] `src/scene/lighting.js` — SpotLight principal + DirectionalLight de preenchimento com sombras, hemisférica fraca, 10 LEDs RectAreaLight pré-alocados
- [x] T018 [US1] `src/scene/labels.js` — CanvasTexture de rótulo por produto
- [x] T019 [US1] `src/scene/bottles.js` — gerador de perfil + seções (redonda/quadrada/frasco/facetada), vidro físico, líquido, tampa, rótulo, `InstancedMesh` por produto
- [x] T020 [US1] `src/scene/gondola.js` — base, colunas por módulo, fundo ripado, prateleiras com borda e LED, cabeçote com tela; construção a partir de `Layout`
- [x] T021 [US1] `src/main.js` — bootstrap: carregar JSON → parse → layout → cena; tela de carregamento com progresso; erro amigável (WebGL2/JSON)

**Checkpoint**: US1 funcional.

---

## Phase 4: User Story 2 - Consultar catálogo no painel lateral (P1)

**Goal**: painel com todos os produtos, detalhes, disponibilidade e seleção sincronizada com a cena.

**Independent Test**: quickstart passos 3–4.

- [x] T022 [P] [US2] `src/ui/styles.css` — layout do painel/gaveta responsiva, cards, selos, toast
- [x] T023 [US2] `src/ui/panel.js` — lista, filtros, card expansível (descrição, notas, harmonização), selo Disponível/Indisponível, botões
- [x] T024 [US2] Seleção: raycast em InstancedMesh → `select`; câmera `setLookAt` suave; destaque e rolagem do card
- [x] T025 [US2] Tela do cabeçote (`labels.js` + `gondola.js`) redesenhada no `select`

---

## Phase 5: User Story 3 - Arranjo automático das prateleiras (P2)

**Goal**: remover/repor prateleiras com reorganização animada.

**Independent Test**: quickstart passos 5–7 e 9.

- [x] T026 [US3] `src/scene/tween.js` — interpolação com easing e cancelamento
- [x] T027 [US3] `gondola.js` — `applyLayout(layout)` anima prateleiras/garrafas existentes até os novos slots, entrada/saída por escala, ajuste da largura (módulos), atualização do shadow map durante a animação
- [x] T028 [US3] Botões Remover/Repor/Restaurar tudo no painel ligados a `canRemove` (RV-01, RV-02) com toast de aviso
- [x] T029 [US3] Reenquadrar a câmera quando a largura da gôndola muda

---

## Phase 6: User Story 4 - Ajustar a iluminação (P3)

- [x] T030 [US4] `src/ui/lightingGui.js` — lil-gui: luz principal (intensidade, cor, ângulo, posição), preenchimento, LEDs (on/off, intensidade, cor), sombras (on/off, tipo PCF/VSM, resolução, raio, bias), exposição, tone mapping, intensidade do ambiente (HDRI)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T031 [P] `tests/smoke.mjs` — Playwright: abre página, sem erros de console, remove prateleira, captura `docs/screenshots/`
- [x] T032 [P] `README.md` — visão geral, como rodar, estrutura, JSON, Spec Kit, créditos/licenças
- [x] T033 [P] `docs/engenharia-de-prompt.md` — prompts da atividade (persona, contexto, restrições, iteração)
- [x] T034 Rodar quickstart.md e testes; commit e push para `develop`

---

## Dependencies & Execution Order

- Setup (T001–T006) → Foundational (T007–T013) → US1 (T014–T021) → US2/US3/US4 (podem seguir em paralelo; US3 reutiliza o painel de US2) → Polish.
- T009 depende de T008 (teste primeiro); T011 depende de T010.
- T019 depende de T018; T020 depende de T015, T017, T019.

## Implementation Strategy

MVP = Phases 1–3 (gôndola visível). Depois US2 (consulta) → US3 (arranjo) → US4 (iluminação),
validando cada checkpoint pelo quickstart.
