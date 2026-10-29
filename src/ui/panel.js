// Painel lateral (country sóbrio e executivo): catálogo numerado com a cor de cada marca numa
// faixa lateral, dados em tabela, selos de disponibilidade e ações de prateleira.

import { formatPrice } from '../core/catalog.js';

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter(Boolean));
  return node;
};

const chips = (title, items) =>
  items.length ? [el('p', { class: 'chips-title', text: title }), el('ul', { class: 'chips' }, ...items.map((t) => el('li', { text: t })))] : [];
const pad = (n) => String(n).padStart(2, '0');

export function createPanel({ store, catalog, onFocus }) {
  const list = document.getElementById('product-list');
  const stats = document.getElementById('panel-stats');
  const restoreAll = document.getElementById('restore-all');
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const toggle = document.getElementById('panel-toggle');
  const toast = document.getElementById('toast');
  const { moeda } = catalog.expositor;

  document.getElementById('panel-title').textContent = catalog.expositor.nome;
  document.getElementById('panel-category').textContent = catalog.expositor.categoria;

  if (catalog.invalidos.length) {
    const warn = document.getElementById('invalid-warning');
    warn.hidden = false;
    warn.textContent = `${catalog.invalidos.length} item(ns) do JSON ignorado(s) por dados inválidos: ${catalog.invalidos
      .map((i) => `${i.id ?? `#${i.index + 1}`} (${i.motivos.join('; ')})`)
      .join(', ')}`;
  }

  const cards = new Map();

  store.produtos.forEach((p, i) => {
    const body = el('div', { class: 'card-body', id: `body-${p.id}`, hidden: true });
    const head = el(
      'button',
      { class: 'card-head', type: 'button', 'aria-expanded': 'false', 'aria-controls': `body-${p.id}`, onclick: () => store.select(store.selecionado === p.id ? null : p.id) },
      el('span', { class: 'card-index', 'aria-hidden': 'true' }, el('b', { text: pad(i + 1) }), el('i', { class: 'swatch', style: `background:${p.garrafa.corLiquido}` })),
      el('span', { class: 'card-main' },
        el('span', { class: 'card-meta', text: [p.tipo, p.pais].filter(Boolean).join(' / ') }),
        el('span', { class: 'card-title', text: p.nome })),
      el('span', { class: 'card-side' },
        el('span', { class: `stamp ${p.disponivel ? 'ok' : 'off'}`, text: p.disponivel ? 'Disponível' : 'Em falta' }),
        el('span', { class: 'price', text: formatPrice(p.preco, moeda) })),
    );

    const specs = el('dl', { class: 'specs' },
      ...[
        ['Marca', p.marca], ['Região', p.regiao], ['Idade', p.idade],
        ['Volume', p.volumeMl && `${p.volumeMl} ml`], ['Teor alcoólico', `${p.teorAlcoolico}%`], ['Preço', formatPrice(p.preco, moeda)],
      ].filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

    const focusBtn = el('button', { class: 'btn primary', type: 'button', text: 'Ver na gôndola', onclick: () => onFocus(p.id) });
    const shelfBtn = el('button', { class: 'btn danger', type: 'button', onclick: () => (store.isRemoved(p.id) ? store.restore(p.id) : store.remove(p.id)) });
    const actions = p.disponivel
      ? el('div', { class: 'actions' }, focusBtn, shelfBtn)
      : el('p', { class: 'unavailable-note', text: 'Em falta: este rótulo está marcado como indisponível no catálogo (disponivel: false) e não ocupa prateleira.' });

    body.append(el('p', { class: 'desc', text: p.descricao }), specs, ...chips('Notas de degustação', p.notas), ...chips('Harmonização', p.harmonizacao), actions);
    const status = el('div', { class: 'card-status' });
    const card = el('li', { class: `card${p.disponivel ? '' : ' unavailable'}`, 'data-id': p.id, style: `--brand:${p.rotulo.destaque}` }, head, body, status);
    list.append(card);
    cards.set(p.id, { card, head, body, focusBtn, shelfBtn, status });
  });

  function refresh() {
    const onShelf = store.layout.shelves.length;
    const disponiveis = store.produtos.filter((p) => p.disponivel).length;
    stats.replaceChildren(...[
      ['Rótulos', store.produtos.length], ['Disponíveis', disponiveis], ['Na gôndola', onShelf], ['Módulos', store.layout.moduleCount],
    ].map(([k, v]) => el('div', {}, el('b', { text: pad(v) }), el('span', { text: k }))));
    restoreAll.disabled = store.removidos.size === 0;

    for (const [id, c] of cards) {
      const p = store.byId(id);
      const removed = store.isRemoved(id);
      const shown = store.filtro === 'todos' || (store.filtro === 'disponiveis' && p.disponivel) || (store.filtro === 'gondola' && store.isOnShelf(id));
      c.card.hidden = !shown;
      const slot = store.layout.shelves.find((sh) => sh.productId === id);
      c.status.textContent = !p.disponivel ? 'Sem prateleira — disponivel: false' : removed ? 'Prateleira removida nesta sessão' : `Na gôndola — módulo ${pad(slot.module + 1)} · prateleira ${pad(slot.level + 1)}`;
      c.card.classList.toggle('removed', removed);
      if (!p.disponivel) continue;
      c.shelfBtn.textContent = removed ? 'Repor prateleira' : 'Remover prateleira';
      c.shelfBtn.classList.toggle('danger', !removed);
      c.focusBtn.disabled = removed;
      const check = removed ? { ok: true } : store.canRemove(id);
      c.shelfBtn.disabled = !check.ok;
      c.shelfBtn.title = check.ok ? '' : check.motivo;
    }
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === store.filtro)));
  }

  function select(id) {
    for (const [cid, c] of cards) {
      const on = cid === id;
      c.card.classList.toggle('selected', on);
      c.head.setAttribute('aria-expanded', String(on));
      c.body.hidden = !on;
    }
    if (id) {
      if (document.body.classList.contains('panel-closed')) setOpen(true);
      cards.get(id)?.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  let toastTimer;
  function notice(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 3200);
  }

  function setOpen(open) {
    document.body.classList.toggle('panel-closed', !open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  filterButtons.forEach((b) => b.addEventListener('click', () => store.setFilter(b.dataset.filter)));
  restoreAll.addEventListener('click', () => store.restoreAll());
  toggle.addEventListener('click', () => setOpen(document.body.classList.contains('panel-closed')));
  if (window.matchMedia('(max-width: 900px)').matches) setOpen(false);

  store.on('layout', refresh);
  store.on('filter', refresh);
  store.on('select', select);
  store.on('notice', notice);
  refresh();

  return { refresh, notice, setOpen };
}
