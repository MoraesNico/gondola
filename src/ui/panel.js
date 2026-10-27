// Painel lateral: catálogo com descrição, disponibilidade e ações de prateleira.

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

export function createPanel({ store, catalog, onFocus }) {
  const list = document.getElementById('product-list');
  const summary = document.getElementById('panel-summary');
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

  for (const p of store.produtos) {
    const body = el('div', { class: 'card-body', id: `body-${p.id}`, hidden: true });
    const head = el(
      'button',
      { class: 'card-head', type: 'button', 'aria-expanded': 'false', 'aria-controls': `body-${p.id}`, onclick: () => store.select(store.selecionado === p.id ? null : p.id) },
      el('span', { class: 'swatch', style: `background:${p.garrafa.corLiquido}` }),
      el('span', {}, el('span', { class: 'card-title', text: p.nome }), el('span', { class: 'card-sub', text: [p.tipo, p.pais].filter(Boolean).join(' · ') })),
      el('span', { class: 'badges' },
        el('span', { class: `badge ${p.disponivel ? 'ok' : 'off'}`, text: p.disponivel ? 'Disponível' : 'Indisponível' }),
        el('span', { class: 'badge neutral shelf-badge' }),
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

    body.append(el('p', { text: p.descricao }), specs, ...chips('Notas de degustação', p.notas), ...chips('Harmonização', p.harmonizacao), actions);
    const card = el('li', { class: `card${p.disponivel ? '' : ' unavailable'}`, 'data-id': p.id }, head, body);
    list.append(card);
    cards.set(p.id, { card, head, body, focusBtn, shelfBtn, shelfBadge: head.querySelector('.shelf-badge') });
  }

  function refresh() {
    const onShelf = store.layout.shelves.length;
    const disponiveis = store.produtos.filter((p) => p.disponivel).length;
    summary.textContent = `${store.produtos.length} rótulos · ${disponiveis} disponíveis · ${onShelf} na gôndola (${store.layout.moduleCount} módulo${store.layout.moduleCount > 1 ? 's' : ''})`;
    restoreAll.disabled = store.removidos.size === 0;

    for (const [id, c] of cards) {
      const p = store.byId(id);
      const removed = store.isRemoved(id);
      const shown = store.filtro === 'todos' || (store.filtro === 'disponiveis' && p.disponivel) || (store.filtro === 'gondola' && store.isOnShelf(id));
      c.card.hidden = !shown;
      c.shelfBadge.textContent = !p.disponivel ? 'Sem prateleira' : removed ? 'Prateleira removida' : 'Na gôndola';
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
