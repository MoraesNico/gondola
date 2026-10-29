# Engenharia de Prompt — Atividade SENAI

Registro dos prompts usados na *Atividade Prática: Engenharia de Prompt para Expositores de
Mercado* e de como cada técnica (Persona, Contexto, Restrições de Saída e Iteração) foi aplicada.

**Nicho escolhido (Passo 1):** Bebidas — gôndola de whiskies premium com guia de harmonização.

---

## Passo 2 — Prompt do aplicativo

### Versão 1 (pedido inicial)

> Crie uma gôndola 3D utilizando three.js e puxando texturas fotorrealistas com normal map, faça
> shadow map para ser possível adicionar iluminação realista na prateleira; utilize Spec Kit para
> melhor definição de tarefas. Bebidas, especificamente whisky: Buffalo Trace, Woodford Reserve,
> Jack Daniels, Jameson, Chivas Regal, Hibiki, Alan Walker, Ballantines, Macalan e Glenlivet
> Caribean Reserve. As informações ficarão em JSON com um campo true/false, para permitir um painel
> lateral com as opções de whisky, suas descrições e disponibilidade, com arranjo automático das
> prateleiras conforme falte alguma bebida. A lista será fixa (sem adicionar/remover do JSON),
> apenas remover a prateleira. Commitar na branch develop, preencher o README e rodar via serve.py.
> Fonte de texturas: Poly Haven.

| Técnica | Onde aparece |
|---|---|
| **Persona** | IA atuando como desenvolvedora 3D / arquiteta de software (implícita) |
| **Contexto** | Expositor de bebidas, lista de 10 rótulos, fonte de texturas, referências de boas práticas |
| **Restrições de saída** | three.js, normal map, shadow map, JSON com booleano, lista fixa, branch `develop`, `serve.py` |
| **Iteração** | ver Versão 2 |

### Versão 2 (refinada após a 1ª resposta)

Limitações observadas na primeira interpretação e corrigidas:

1. **Nomes ambíguos** — "Alan Walker" → *Johnnie Walker Black Label*; "Macalan" → *The Macallan 12
   Double Cask*; "Ballantines" → *Ballantine's Finest*; "Caribean" → *Caribbean*.
2. **"Remover a prateleira"** era ambíguo (editar o JSON? esconder?) → definido como ação de
   sessão no painel, sem tocar no JSON, com "Repor" e "Restaurar tudo".
3. **Arranjo automático** precisava de regra objetiva → módulos de 1 m com até 5 prateleiras,
   distribuição equilibrada e remoção do módulo vazio.
4. **Fluxo e validação** exigidos pela atividade foram explicitados:

> Atue como **arquiteto(a) de software e UX designer de varejo**. Projete o app da tela embarcada
> numa gôndola de whiskies premium. Entregue: (a) fluxo de uso em **no máximo 4 telas**;
> (b) **exemplo estritamente em JSON** do catálogo, com `disponivel` booleano por produto, preço,
> teor alcoólico, notas de degustação e harmonização; (c) **três regras de validação** da
> interação do cliente. Restrições: lista fixa de 10 produtos; a UI não edita o JSON; texto em
> pt-BR; preços ilustrativos em BRL.

Resultado: [spec.md](../specs/001-gondola-whisky-3d/spec.md) (fluxo de 4 telas e regras RV-01 a
RV-03) e [data/whiskies.json](../data/whiskies.json).

---

## Passo 3 — Prompt do conceito visual (imagem)

### Versão 1

> Render 3D realista de uma gôndola de supermercado com garrafas de whisky.

### Versão 2 (refinada)

Problemas típicos da v1: móvel genérico, iluminação chapada, garrafas sem leitura de marca e
sem a tela interativa. Prompt refinado com vocabulário técnico:

> Photorealistic retail architecture render of a **wall-mounted two-bay gondola (2 × 1 m modules,
> 2.4 m tall)** for premium whisky. **Materials:** lacquered cherry-wood shelves with brushed
> aluminium price rails, vertical black-painted wooden slat back panel, graphite powder-coated
> steel uprights and plinth, polished cream marble floor, warm off-white plaster wall.
> **Lighting:** warm 3000 K **LED strips under every shelf** washing the bottles below, one
> ceiling track spotlight creating soft contact shadows, subtle HDRI reflections on glass.
> **Integrated interactive screen** in the header (cabeçote), 1 m wide, showing product name and
> price. Ten shelves, one brand per shelf (bourbons, Tennessee, Irish, blended & single malt
> Scotch, Japanese), bottles faced forward in two rows. **Style:** commercial product photography,
> 35 mm lens, eye-level three-quarter view, shallow depth of field, ACES tone mapping, 4K.

O mesmo vocabulário guiou a cena three.js (ver [research.md](../specs/001-gondola-whisky-3d/research.md)):
cerejeira laqueada, ripado preto, aço grafite e mármore vêm do Poly Haven; LEDs são
`RectAreaLight`; a tela do cabeçote é uma `CanvasTexture` atualizada ao selecionar um produto.

---

## Passo 4 — Iterações aplicadas no próprio código

| Iteração | Problema | Ajuste |
|---|---|---|
| 1 | API do Poly Haven respondeu 403 | `User-Agent` explícito no `fetch_polyhaven.py` |
| 2 | 20 texturas 2k ≈ 430 MB de GPU | mapa empacotado **ARM** (AO/Rough/Metal) e 1k em peças pequenas |
| 3 | 1,6 M triângulos/quadro | anéis só onde há curvatura; trilho + mãos-francesas fundidos (660 k) |
| 4 | `PCFSoftShadowMap` removido no r186 | `PCFShadowMap` + `shadow.radius` (amostragem Vogel) |
| 5 | Vidro transmissivo não mostra líquido transmissivo | líquido opaco brilhante dentro do vidro |

---

## Iteração 2 — otimização, rótulos fiéis e nova estética

### Prompt do cliente

> Atualização focada em otimização e semelhança dos reais rótulos; mudar a estética dos menus
> para brutalismo mantendo sofisticação, com fontes e cores diferentes e iluminação quente.
> Referências: guia de 100 dicas de otimização three.js (r186) e fotos das 10 garrafas
> (`exploit.md`: usar só como referência de cor do líquido, formato e rótulo — não como textura).

| Técnica | Como foi aplicada |
|---|---|
| **Persona** | IA como engenheira gráfica three.js + designer de embalagem/UI |
| **Contexto** | guia de otimização ([docs/referencias/otimizacao-threejs.md](referencias/otimizacao-threejs.md)) e fotos analisadas em [docs/referencias/rotulos.md](referencias/rotulos.md) |
| **Restrições de saída** | fotos só como referência; ≤ 100 draw calls; fontes livres e locais; continuar sem build |
| **Iteração** | ver tabela abaixo |

Spec Kit: [specs/002-otimizacao-rotulos-country/](../specs/002-otimizacao-rotulos-country/) e
constituição emendada para a v1.1.0 (princípio VI — fidelidade às referências).

### Iterações aplicadas no código

| Iteração | Problema | Ajuste |
|---|---|---|
| 6 | 277 draw calls por quadro | 2 `BatchedMesh` para todas as garrafas + `InstancedMesh` na estrutura → 31 |
| 7 | 10 RectAreaLight avaliadas em todo pixel | LEDs assados (lightmap nos tampos + retroiluminação emissiva no fundo); RectAreaLight vira modo opcional |
| 8 | JPG descomprimido na GPU (261 MiB) | KTX2: ETC1S para cor e ARM, UASTC + RDO para normal |
| 9 | KTX-Software indisponível no ambiente | encoder `ktx2-encoder` (basis_universal em WASM) via Node |
| 10 | líquido opaco parecia suco de laranja | o próprio vidro transmissivo tingido por vértice: o fundo aparece através do âmbar |
| 11 | papel creme detectado como foil dourado (rótulos escuros) | limite de saturação que cresce com a luminosidade |
| 12 | textos cortados nas laterais curvas | textos principais limitados à faixa frontal visível (±35–45°) |
| 13 | garrafas escuras contra o ripado preto | retroiluminação âmbar emissiva atrás de cada prateleira |
| 14 | cliente revisou a estética: "country sem ser estereotipado, sóbrio e executivo" | brutalismo descartado; couro, linho, verde-floresta e latão, Cormorant Garamond + Libre Franklin + Zilla Slab, sem ícones de faroeste |
