# Contrato dos módulos puros

Módulos ES sem dependência de three.js ou DOM — importáveis no navegador e no Node (`node --test`).

## `src/core/catalog.js`

```js
parseCatalog(raw: unknown) => {
  expositor: { nome, categoria, moeda, atualizadoEm },
  produtos: Produto[],          // válidos, ordenados por `ordem`, com defaults de `garrafa`
  invalidos: { index, id?, motivos: string[] }[]   // descartados (RV-03)
}
// Lança CatalogError se `raw` não for objeto ou `produtos` não for array.
```

- IDs duplicados: a 1ª ocorrência vence; as demais vão para `invalidos` com motivo `id duplicado`.
- `garrafa` ausente/parcial é completada com defaults (`formato: "redonda"`, `altura: 0.29`, …).

## `src/core/layout.js`

```js
LAYOUT = { MODULE_WIDTH: 1.0, MAX_SHELVES: 5, BOTTOM: 0.24, TOP: 1.74, PITCH_MAX: 0.42 }

eligibleProducts(produtos, removidos: Set<string>) => Produto[]      // RV-01
computeLayout(produtos, removidos?: Set<string>) => Layout            // FR-007/FR-008
canRemove(produtos, removidos, id) => { ok: boolean, motivo?: string } // RV-01/RV-02
```

Invariantes verificadas em `tests/layout.test.mjs`:

1. `shelves.length === eligibleProducts(...).length`.
2. Nenhum módulo tem mais que `MAX_SHELVES`; diferença entre módulos ≤ 1.
3. `moduleCount === max(1, ceil(n / MAX_SHELVES))`.
4. Todo `y` ∈ [`BOTTOM`, `TOP`]; dentro de um módulo, `y` decresce com `level`.
5. A ordem de `shelves` segue `ordem` do catálogo.
6. `canRemove` recusa produto indisponível, já removido, inexistente ou a última prateleira.

## `src/state.js` (eventos)

| Evento | Payload | Emissor → Ouvinte |
|---|---|---|
| `layout` | `Layout` | state → cena, painel |
| `select` | `id \| null` | painel/cena → cena (câmera, cabeçote), painel (destaque) |
| `notice` | `string` | state → painel (toast) |
