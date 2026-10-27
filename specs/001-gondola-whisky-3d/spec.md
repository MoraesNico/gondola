# Feature Specification: Gôndola 3D de Whisky com Painel de Catálogo

**Feature Branch**: `develop`

**Created**: 2026-10-27

**Status**: Approved

**Input**: User description: "Criar uma gôndola 3D utilizando three.js com texturas fotorrealistas (Poly Haven) com normal map e shadow map para iluminação realista na prateleira. Nicho: bebidas — whisky: Buffalo Trace, Woodford Reserve, Jack Daniel's, Jameson, Chivas Regal, Hibiki, Johnnie Walker, Ballantine's, Macallan e Glenlivet Caribbean Reserve. Dados em JSON com campo true/false de disponibilidade, painel lateral com opções de whisky, descrições e disponibilidade, e arranjo automático das prateleiras conforme falte alguma bebida. Lista fixa: sem adicionar/remover do JSON, apenas remover a prateleira. Servir via serve.py."

## Contexto da Atividade

Atividade Prática SENAI — *Engenharia de Prompt para Expositores de Mercado*. Nicho escolhido:
**Bebidas** (quiosque/gôndola de destilados premium com guia de harmonização). A solução combina
estrutura física (gôndola, prateleiras, iluminação LED) com uma tela interativa embarcada no
cabeçote da gôndola e um painel de consulta rápida.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar a gôndola fotorrealista (Priority: P1)

Como cliente/visitante, abro o expositor e vejo uma gôndola de loja em 3D, com prateleiras de
madeira, estrutura metálica, piso e parede com aparência real, garrafas de cada whisky
disponível organizadas uma marca por prateleira, iluminação com sombras e reflexos. Posso girar,
aproximar e afastar a câmera.

**Why this priority**: É o núcleo da entrega (conceito visual 3D/fotorrealista do expositor).
Sem ele nada mais faz sentido.

**Independent Test**: Abrir a página servida localmente e verificar que a gôndola aparece com
texturas (relevo visível pelo normal map), sombras das garrafas nas prateleiras e navegação de
câmera fluida.

**Acceptance Scenarios**:

1. **Given** o servidor local em execução, **When** abro a URL no navegador, **Then** a gôndola é exibida em até 5 s com uma prateleira por whisky disponível.
2. **Given** a cena carregada, **When** arrasto o mouse/dedo, **Then** a câmera orbita a gôndola sem atravessar o piso.
3. **Given** a luz principal ligada, **When** observo as prateleiras, **Then** as garrafas projetam sombras suaves sobre a madeira e o fundo.

---

### User Story 2 - Consultar catálogo no painel lateral (Priority: P1)

Como cliente, abro o painel lateral e vejo os 10 whiskies com nome, tipo, origem, teor alcoólico,
preço ilustrativo, descrição, notas de degustação, sugestões de harmonização e um selo de
disponibilidade (Disponível / Indisponível). Ao selecionar um item, a câmera enquadra a
prateleira correspondente e a tela do cabeçote mostra o produto.

**Why this priority**: É a "interface de consulta rápida" exigida pelo expositor inteligente.

**Independent Test**: Clicar em cada item do painel e conferir dados e enquadramento; clicar numa
garrafa na cena e conferir que o item correspondente é destacado no painel.

**Acceptance Scenarios**:

1. **Given** o painel aberto, **When** clico em "Ver na gôndola" de um whisky disponível, **Then** a câmera se move suavemente até a prateleira dele e o cabeçote exibe nome e preço.
2. **Given** a cena, **When** clico em uma garrafa, **Then** o painel rola até o whisky correspondente e o destaca.
3. **Given** um whisky com `disponivel: false` no JSON, **When** vejo o painel, **Then** ele aparece com selo "Indisponível" e sem botão de ver na gôndola.

---

### User Story 3 - Arranjo automático das prateleiras (Priority: P2)

Como operador da loja, quando uma bebida falta (no JSON, `disponivel: false`) ou removo sua
prateleira pelo painel, a gôndola se reorganiza sozinha: as prateleiras restantes são
redistribuídas entre os módulos, espaçadas de forma uniforme, e a gôndola diminui de largura se
sobrar um módulo vazio. Posso repor uma prateleira removida na sessão ou restaurar tudo.

**Why this priority**: Diferencial pedido explicitamente; depende de US1.

**Independent Test**: Remover prateleiras uma a uma pelo painel e observar a transição animada e o
novo arranjo; alterar `disponivel` no JSON, recarregar e ver o arranjo inicial já compactado.

**Acceptance Scenarios**:

1. **Given** 9 prateleiras visíveis em 2 módulos (5 + 4), **When** removo 4 prateleiras, **Then** a gôndola passa a 1 módulo com 5 prateleiras, com animação de até 1,2 s.
2. **Given** uma prateleira removida, **When** clico em "Repor prateleira", **Then** ela volta na posição definida pela ordem do catálogo.
3. **Given** resta 1 prateleira, **When** tento removê-la, **Then** a ação é bloqueada com aviso "A gôndola precisa de ao menos uma prateleira".

---

### User Story 4 - Ajustar a iluminação (Priority: P3)

Como projetista do expositor, abro um painel de iluminação e ajusto intensidade e cor da luz
principal, ligo/desligo as fitas LED sob as prateleiras, troco o tipo/qualidade de sombra e a
exposição, para avaliar o conceito de iluminação realista.

**Why this priority**: Atende ao pedido de "adicionar iluminação realista na prateleira"; é
incremental sobre US1.

**Independent Test**: Alterar cada controle e observar o efeito imediato na cena.

**Acceptance Scenarios**:

1. **Given** o painel de iluminação, **When** desligo as fitas LED, **Then** as faixas emissivas e a luz sob cada prateleira se apagam.
2. **Given** sombras ligadas, **When** troco a resolução do shadow map, **Then** a nitidez da sombra muda sem recarregar a página.

### Edge Cases

- JSON inexistente ou malformado → mensagem de erro amigável sobre a cena, nada de tela preta.
- Produto com campo obrigatório ausente ou `disponivel` não-booleano → item ignorado com aviso no console e no painel ("dados inválidos").
- IDs duplicados → apenas a primeira ocorrência é usada.
- Todos os produtos indisponíveis → gôndola vazia com 1 módulo e mensagem "Sem produtos disponíveis".
- Textura que falha ao carregar → material cai para cor sólida equivalente, cena continua.
- Navegador sem WebGL2 → aviso explicando o requisito.
- Janela estreita (tablet retrato) → painel vira gaveta sobreposta que pode ser recolhida.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST renderizar uma gôndola de centro de loja em 3D composta por base, colunas, painel de fundo, prateleiras e cabeçote com tela.
- **FR-002**: Todas as superfícies principais (prateleira, fundo, estrutura metálica, piso, parede) MUST usar texturas fotorrealistas CC0 do Poly Haven com mapa de cor, normal map e roughness.
- **FR-003**: A cena MUST usar shadow mapping: garrafas e estrutura projetam sombras; prateleiras, fundo e piso as recebem.
- **FR-004**: Cada um dos 10 whiskies MUST ter uma garrafa com silhueta própria (redonda, quadrada, frasco achatado, facetada) e rótulo com o nome do produto.
- **FR-005**: Os dados MUST vir de um arquivo JSON contendo, por produto, o campo booleano `disponivel`.
- **FR-006**: O painel lateral MUST listar todos os 10 produtos com descrição, dados técnicos, notas, harmonização e selo de disponibilidade.
- **FR-007**: Apenas produtos com `disponivel: true` e não removidos na sessão MUST ocupar prateleira.
- **FR-008**: O arranjo MUST distribuir as prateleiras em módulos de até 5 prateleiras, equilibrando a quantidade entre módulos e removendo módulos vazios.
- **FR-009**: Mudanças de arranjo MUST ser animadas (sem saltos) e as sombras atualizadas ao fim.
- **FR-010**: O usuário MUST poder remover e repor prateleiras na sessão, e restaurar o estado do JSON; a UI MUST NOT editar o arquivo JSON nem criar produtos.
- **FR-011**: Selecionar um produto (painel ou clique na garrafa) MUST enquadrar a prateleira e mostrar o produto na tela do cabeçote.
- **FR-012**: O usuário MUST poder ajustar a iluminação (luz principal, LEDs, sombras, exposição).
- **FR-013**: O projeto MUST ser executável com um único comando `python serve.py`, que abre um servidor HTTP local com tipos MIME corretos.

### Regras de validação da interação do cliente

1. **RV-01 — Disponibilidade é soberana**: produto com `disponivel: false` não pode ser exibido nem reposto na gôndola pela UI.
2. **RV-02 — Mínimo de uma prateleira**: não é permitido remover a última prateleira visível.
3. **RV-03 — Integridade do catálogo**: só entram no catálogo itens com `id` único, `nome`, `descricao`, `preco` ≥ 0, `teorAlcoolico` entre 0 e 100 e `disponivel` booleano; os demais são descartados e sinalizados.

### Fluxo de uso (máx. 4 telas)

1. **Vitrine 3D** — gôndola em tela cheia, câmera livre, clique em garrafa.
2. **Catálogo (painel lateral)** — lista com filtros "Todos / Disponíveis / Na gôndola".
3. **Detalhe do produto** — card expandido + tela do cabeçote + câmera enquadrando a prateleira.
4. **Iluminação** — painel de controles de luz e sombra.

### Key Entities

- **Expositor**: metadados da gôndola (nome, categoria, moeda, data de atualização).
- **Produto (Whisky)**: id, nome, marca, tipo, país/região, idade, volume, teor alcoólico, preço, descrição, notas, harmonização, `disponivel`, ordem e aparência da garrafa (formato, cores de vidro/líquido/rótulo/tampa).
- **Arranjo**: resultado calculado — lista de módulos, cada um com prateleiras (produto, índice, altura).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A cena completa aparece em até 5 s em conexão local num notebook comum.
- **SC-002**: Navegação mantém ≥ 50 fps em GPU integrada a 1080p com sombras ligadas.
- **SC-003**: 100% dos 10 produtos aparecem no painel com todos os campos preenchidos.
- **SC-004**: Mudar `disponivel` de qualquer produto e recarregar reflete o novo arranjo sem mudança de código.
- **SC-005**: Remover/repor uma prateleira conclui a reorganização em ≤ 1,2 s.
- **SC-006**: Zero erros no console do navegador durante o fluxo das 4 telas.

## Assumptions

- "Alan Walker" foi interpretado como **Johnnie Walker** (Black Label); "Macalan" como **The Macallan** (12 anos Double Cask); "Ballantines" como **Ballantine's Finest**; "Glenlivet Caribean Reserve" como **The Glenlivet Caribbean Reserve**; Hibiki como **Hibiki Japanese Harmony**.
- Preços em BRL são ilustrativos para o protótipo.
- Hibiki começa com `disponivel: false` no JSON para demonstrar o arranjo automático (basta mudar para `true`).
- Garrafas são modeladas proceduralmente (não há modelos 3D licenciados das marcas); rótulos usam apenas texto.
- Remoções de prateleira valem para a sessão do navegador (não persistem).
- Navegadores-alvo: Chrome/Edge/Firefox/Safari atuais com WebGL2.
