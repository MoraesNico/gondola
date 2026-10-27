# Data Model: Gôndola 3D de Whisky

Contrato formal: [contracts/whiskies.schema.json](./contracts/whiskies.schema.json).

## Expositor (`expositor`)

| Campo | Tipo | Regra |
|---|---|---|
| `nome` | string | obrigatório |
| `categoria` | string | obrigatório |
| `moeda` | string ISO 4217 | padrão `BRL` |
| `atualizadoEm` | data `YYYY-MM-DD` | opcional |

## Produto (`produtos[]`)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string slug | obrigatório, único (RV-03) |
| `ordem` | inteiro ≥ 1 | define a sequência nas prateleiras; ausente → posição no array |
| `nome` | string | obrigatório |
| `marca`, `tipo`, `pais`, `regiao`, `idade` | string | exibição |
| `volumeMl` | inteiro > 0 | |
| `teorAlcoolico` | número 0–100 | obrigatório (RV-03) |
| `preco` | número ≥ 0 | obrigatório (RV-03), moeda do expositor |
| `descricao` | string | obrigatório |
| `notas` | string[] | notas de degustação |
| `harmonizacao` | string[] | guia de harmonização |
| **`disponivel`** | **boolean** | **obrigatório; `false` remove o produto da gôndola (RV-01)** |
| `garrafa` | objeto Garrafa | aparência procedural |

### Garrafa (`produtos[].garrafa`)

| Campo | Tipo | Valores |
|---|---|---|
| `formato` | enum | `redonda`, `quadrada`, `frasco`, `facetada` |
| `altura` | número (m) | 0.18–0.36 |
| `largura` | número (m) | 0.06–0.12 |
| `profundidade` | número (m) | opcional; padrão = largura |
| `ombro` | enum | `alto`, `medio`, `baixo` (posição do ombro) |
| `corVidro`, `corLiquido`, `corRotulo`, `corTextoRotulo`, `corTampa` | hex `#rrggbb` | |
| `inclinacaoRotulo` | número (graus) | opcional (Johnnie Walker = 24) |

## Estado de sessão (memória, não persiste)

| Campo | Tipo | Descrição |
|---|---|---|
| `removidos` | Set\<id\> | prateleiras removidas pelo usuário |
| `selecionado` | id \| null | produto em foco |
| `filtro` | `todos` \| `disponiveis` \| `gondola` | filtro do painel |

### Transições

```text
           JSON disponivel=false
 [Indisponível] ◄────────────────── (somente via JSON; UI não altera)

 [Na gôndola] ──Remover prateleira──► [Removido na sessão]
      ▲         (bloqueado se for a última — RV-02)   │
      └───────────Repor prateleira / Restaurar tudo───┘
```

## Arranjo (calculado por `computeLayout`)

```text
Layout {
  moduleCount: int ≥ 1
  width: number (m)               // moduleCount × MODULE_WIDTH
  modules: [{ index, x, shelves: [ShelfSlot] }]
  shelves: [ShelfSlot]            // achatado, na ordem do catálogo
}
ShelfSlot { productId, module, level, x, y }
```

Regras:
1. Produtos elegíveis = `disponivel === true` ∧ `id ∉ removidos`, ordenados por `ordem`.
2. `moduleCount = max(1, ceil(n / 5))`.
3. Distribuição equilibrada: cada módulo recebe `floor(n / m)` e os `n mod m` primeiros recebem +1.
4. Dentro do módulo, preenchimento de cima para baixo (nível 0 = topo, zona de maior visibilidade).
5. Passo vertical `pitch = min(PITCH_MAX, (TOP − BOTTOM) / (k − 1))`; a pilha é centralizada na faixa útil.
6. `x` do módulo `i` = `(i − (m − 1) / 2) × MODULE_WIDTH` (gôndola centrada na origem).
