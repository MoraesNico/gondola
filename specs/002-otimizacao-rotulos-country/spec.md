# Feature Specification: Otimização, rótulos fiéis e interface country executiva

**Feature Branch**: `develop`

**Created**: 2026-10-29

**Status**: Approved

**Input**: User description (revisão 2026-10-29: o cliente trocou o brutalismo por "country sem ser estereotipado, um country sóbrio e executivo"): "Atualização focada em otimização e semelhança com os rótulos reais; mudar a estética dos menus para brutalismo mantendo sofisticação, com fontes e cores diferentes e iluminação quente. Arquivos de referência: guia de otimização three.js r186 e fotos das 10 garrafas (usar só como referência de cor do líquido, formato da garrafa e rótulo, priorizando se parecer o máximo possível com o real)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reconhecer cada whisky à primeira vista (Priority: P1)

Como cliente diante da gôndola, reconheço cada marca pela garrafa, sem ler o nome: a
silhueta, a cor do líquido, a cápsula do gargalo e o rótulo se parecem com os do mercado
(ex.: faixa preta inclinada do Johnnie Walker, vidro verde do Jameson, rótulo preto do Jack
Daniel's, garrafa facetada com rolha de vidro do Hibiki).

**Why this priority**: É o principal pedido da atualização e o que dá credibilidade ao expositor.

**Independent Test**: Abrir a vista de comparação (`?lineup`) com as 10 garrafas lado a lado e
compará-las às referências da tabela em `docs/referencias/rotulos.md`.

**Acceptance Scenarios**:

1. **Given** a vista de comparação, **When** observo cada garrafa, **Then** silhueta, cápsula, cor do líquido e composição do rótulo batem com a linha correspondente da tabela de referências.
2. **Given** a gôndola, **When** aproximo a câmera de uma prateleira, **Then** os textos principais do rótulo continuam legíveis e nítidos.

---

### User Story 2 - Navegação fluida em máquinas modestas (Priority: P1)

Como operador, abro o expositor num notebook com GPU integrada ou num tablet e a navegação
continua fluida; se o aparelho for fraco, a qualidade se ajusta sozinha.

**Why this priority**: É a "otimização" pedida explicitamente.

**Independent Test**: Abrir com `?perf` e conferir o painel de desempenho (draw calls,
triângulos, memória de textura, nível de qualidade) antes e depois da atualização.

**Acceptance Scenarios**:

1. **Given** a cena carregada, **When** leio o painel de desempenho, **Then** a gôndola completa usa ≤ 100 draw calls por quadro (somando sombras e transmissão).
2. **Given** um aparelho lento, **When** os quadros passam de ~28 ms em média, **Then** a resolução/sombra cai um nível, sem oscilar mais de 3 vezes.
3. **Given** a GPU perde o contexto, **When** isso ocorre, **Then** aparece aviso e a página se recupera sozinha.

---

### User Story 3 - Interface country sóbria e executiva (Priority: P2)

Como cliente, uso um painel com estética **country sóbria e executiva** — a de um clube de
campo ou de um escritório de fazenda de alto padrão: linho e papel creme, couro conhaque,
verde-floresta, latão em filetes finos, serifa clássica nos títulos e uma sans americana
discreta nos dados. **Sem estereótipos**: nada de cordas, estrelas, ferraduras, madeira
"faroeste" ou fontes de cartaz de saloon. Cada whisky tem sua cor de destaque, aplicada com
contenção (uma faixa lateral, não blocos chapados).

**Independent Test**: Percorrer painel, filtros, cards, avisos, carregamento, painel de
iluminação e tela do cabeçote e verificar a mesma linguagem visual.

**Acceptance Scenarios**:

1. **Given** o painel, **When** vejo a lista, **Then** cada card mostra número, faixa na cor da marca, nome em serifa, dados alinhados em tabela e selos discretos.
2. **Given** qualquer botão, **When** passo o mouse/clico, **Then** ele responde com mudança de tom e foco visível, sem efeitos chamativos.
3. **Given** toda a interface, **When** a examino, **Then** não há ícones ou tipos que remetam a clichês de faroeste.

---

### User Story 4 - Iluminação quente de loja de destilados (Priority: P2)

Como cliente, vejo a gôndola em luz quente (≈ 2700–3000 K), com brilho âmbar dos LEDs sob as
prateleiras e reflexos suaves, como numa adega.

**Independent Test**: Comparar a vista geral antes/depois; desligar e ligar os LEDs no painel.

**Acceptance Scenarios**:

1. **Given** a vista geral, **When** a cena abre, **Then** a temperatura de cor geral é quente e os LEDs projetam faixas de luz âmbar no fundo e nos tampos.

### Edge Cases

- Navegador sem suporte a KTX2/transcodificador → texturas JPG originais (fallback automático).
- Fontes ainda não carregadas → rótulos esperam `document.fonts`; se falhar, usam fonte de sistema.
- Estilo de rótulo desconhecido no JSON → rótulo genérico (comportamento da versão 1).
- `?quality=high|medium|low` trava o nível de qualidade (útil para testes e demonstrações).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-101**: Cada garrafa MUST ter silhueta, gargalo, cápsula/tampa e espessura de fundo configuráveis no JSON, refletindo a referência.
- **FR-102**: Cada produto MUST declarar `rotulo.estilo`; o sistema MUST desenhar rótulo principal, rótulos secundários (gargantilha, faixa inferior, impressão no vidro, medalhão) e cápsula conforme o estilo.
- **FR-103**: As fotos de referência MUST NOT ser usadas como textura.
- **FR-104**: Garrafas, rótulos e etiquetas de preço de todos os produtos MUST ser desenhados com no máximo 2 draw calls por passe (um opaco, um vidro).
- **FR-105**: Texturas PBR MUST ser carregadas em KTX2 (Basis Universal) com fallback para JPG.
- **FR-106**: A iluminação LED padrão MUST ser assada (lightmaps regenerados a cada rearranjo); o modo "LED realista" (RectAreaLight) MUST continuar disponível no painel.
- **FR-107**: O sistema MUST pré-compilar shaders antes de esconder o carregamento, tratar perda de contexto WebGL e ajustar a qualidade conforme o desempenho.
- **FR-108**: Um painel de desempenho MUST ser exibido com `?perf`.
- **FR-109**: A interface MUST seguir a linguagem country sóbria e executiva descrita na US3, com fontes OFL locais.
- **FR-110**: A iluminação padrão MUST ser quente (luz principal ≈ 2900 K, LEDs ≈ 2900 K, retroiluminação âmbar).

### Key Entities

- **Garrafa** (estendida): `ombro` (enum ou `[início, fim]`), `raioGargalo`, `fundo`, `tampa` (`capsula` | `rolha-vidro`), `capsula { inicio, cor, metalica }`.
- **Rótulo**: `estilo` (um dos 10 desenhos ou `generico`), `destaque` (cor da marca na interface), `textos` (mapa opcional de textos sobrescritos).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: Draw calls por quadro na vista geral caem de 277 para ≤ 100.
- **SC-102**: Memória estimada de texturas na GPU cai pelo menos 50%.
- **SC-103**: As 10 garrafas são identificadas pelo nome por um observador olhando só a vista de comparação.
- **SC-104**: Zero erros de console no smoke test.

## Assumptions

- Emblemas (bisão, brasões, homem caminhando, castelo) são simplificações vetoriais, não cópias.
- `WebGLRenderer` é mantido: o guia recomenda migrar para WebGPU só ao bater limites de desempenho (dicas 6, 8 e 9); a meta de draw calls é alcançada com instancing/batching.
