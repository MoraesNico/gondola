// Estado de sessão da gôndola: prateleiras removidas, produto selecionado e filtro do painel.
// Nada aqui altera o JSON — a lista de produtos é fixa (constituição, Restrições).

import { computeLayout, canRemove } from './core/layout.js';

export function createStore(produtos) {
  const removidos = new Set();
  const listeners = new Map();
  let selecionado = null;
  let filtro = 'todos';
  let layout = computeLayout(produtos, removidos);

  const emit = (event, payload) => (listeners.get(event) ?? []).forEach((fn) => fn(payload));
  const byId = (id) => produtos.find((p) => p.id === id);

  function relayout() {
    layout = computeLayout(produtos, removidos);
    emit('layout', layout);
  }

  return {
    produtos,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => listeners.set(event, listeners.get(event).filter((f) => f !== fn));
    },

    get layout() { return layout; },
    get selecionado() { return selecionado; },
    get filtro() { return filtro; },
    get removidos() { return new Set(removidos); },

    byId,
    isOnShelf: (id) => layout.shelves.some((s) => s.productId === id),
    isRemoved: (id) => removidos.has(id),
    canRemove: (id) => canRemove(produtos, removidos, id),

    remove(id) {
      const check = canRemove(produtos, removidos, id);
      if (!check.ok) {
        emit('notice', check.motivo);
        return false;
      }
      removidos.add(id);
      if (selecionado === id) this.select(null);
      relayout();
      return true;
    },

    restore(id) {
      const p = byId(id);
      if (!p?.disponivel) {
        emit('notice', `${p?.nome ?? 'Produto'} está indisponível no catálogo e não pode voltar à gôndola.`);
        return false;
      }
      if (!removidos.delete(id)) return false;
      relayout();
      return true;
    },

    restoreAll() {
      if (!removidos.size) return;
      removidos.clear();
      relayout();
    },

    select(id) {
      const next = id && byId(id) ? id : null;
      if (next === selecionado) return;
      selecionado = next;
      emit('select', selecionado);
    },

    setFilter(f) {
      filtro = f;
      emit('filter', filtro);
    },
  };
}
