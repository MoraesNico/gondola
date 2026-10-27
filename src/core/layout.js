// Algoritmo de arranjo automático das prateleiras.
// Módulo puro: recebe produtos + prateleiras removidas na sessão e devolve onde cada
// prateleira fica. A cena 3D apenas anima até esse resultado.

export const LAYOUT = Object.freeze({
  MODULE_WIDTH: 1.0, // m — módulo padrão de gôndola
  MAX_SHELVES: 5, // prateleiras por módulo
  BOTTOM: 0.24, // m — altura da prateleira mais baixa (acima do rodapé)
  TOP: 1.74, // m — altura máxima da prateleira mais alta (sob o cabeçote)
  PITCH_MAX: 0.42, // m — espaçamento máximo entre prateleiras
});

const byOrder = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);

// RV-01: só entra na gôndola o que está disponível no JSON e não foi removido na sessão.
export function eligibleProducts(produtos, removidos = new Set()) {
  return produtos.filter((p) => p.disponivel === true && !removidos.has(p.id)).sort(byOrder);
}

function shelfHeights(count) {
  if (count === 0) return [];
  const range = LAYOUT.TOP - LAYOUT.BOTTOM;
  if (count === 1) return [LAYOUT.BOTTOM + range / 2];
  const pitch = Math.min(LAYOUT.PITCH_MAX, range / (count - 1));
  const offset = (range - pitch * (count - 1)) / 2; // centraliza a pilha na faixa útil
  // nível 0 = topo
  return Array.from({ length: count }, (_, level) => LAYOUT.TOP - offset - level * pitch);
}

export function computeLayout(produtos, removidos = new Set()) {
  const elig = eligibleProducts(produtos, removidos);
  const n = elig.length;
  const moduleCount = Math.max(1, Math.ceil(n / LAYOUT.MAX_SHELVES));
  const base = Math.floor(n / moduleCount);
  const extra = n % moduleCount;

  const modules = [];
  const shelves = [];
  let cursor = 0;
  for (let i = 0; i < moduleCount; i++) {
    const count = base + (i < extra ? 1 : 0);
    const x = (i - (moduleCount - 1) / 2) * LAYOUT.MODULE_WIDTH;
    const heights = shelfHeights(count);
    const moduleShelves = heights.map((y, level) => ({
      productId: elig[cursor + level].id,
      module: i,
      level,
      x,
      y,
    }));
    cursor += count;
    modules.push({ index: i, x, shelves: moduleShelves });
    shelves.push(...moduleShelves);
  }

  return { moduleCount, width: moduleCount * LAYOUT.MODULE_WIDTH, modules, shelves };
}

// RV-01 + RV-02 — valida a remoção de uma prateleira pela interface.
export function canRemove(produtos, removidos, id) {
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return { ok: false, motivo: 'Produto não encontrado no catálogo.' };
  if (!produto.disponivel) return { ok: false, motivo: `${produto.nome} está indisponível no catálogo.` };
  if (removidos.has(id)) return { ok: false, motivo: `A prateleira de ${produto.nome} já foi removida.` };
  if (eligibleProducts(produtos, removidos).length <= 1) {
    return { ok: false, motivo: 'A gôndola precisa de ao menos uma prateleira.' };
  }
  return { ok: true };
}
