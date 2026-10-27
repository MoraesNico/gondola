import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, eligibleProducts, computeLayout, canRemove } from '../src/core/layout.js';

const make = (n, unavailable = []) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    ordem: i + 1,
    disponivel: !unavailable.includes(i + 1),
  }));

const EPS = 1e-9;

function checkInvariants(produtos, removidos = new Set()) {
  const layout = computeLayout(produtos, removidos);
  const elig = eligibleProducts(produtos, removidos);
  const n = elig.length;
  // 1. uma prateleira por produto elegível
  assert.equal(layout.shelves.length, n);
  // 3. quantidade de módulos
  assert.equal(layout.moduleCount, Math.max(1, Math.ceil(n / LAYOUT.MAX_SHELVES)));
  assert.equal(layout.modules.length, layout.moduleCount);
  assert.equal(layout.width, layout.moduleCount * LAYOUT.MODULE_WIDTH);
  // 2. limite por módulo e equilíbrio
  const counts = layout.modules.map((m) => m.shelves.length);
  assert.ok(counts.every((c) => c <= LAYOUT.MAX_SHELVES));
  if (n > 0) assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  // 4. faixa vertical e ordem decrescente por nível
  for (const m of layout.modules) {
    m.shelves.forEach((s, i) => {
      assert.ok(s.y >= LAYOUT.BOTTOM - EPS && s.y <= LAYOUT.TOP + EPS, `y fora da faixa: ${s.y}`);
      assert.equal(s.level, i);
      assert.equal(s.x, m.x);
      if (i > 0) assert.ok(s.y < m.shelves[i - 1].y);
    });
  }
  // 5. ordem do catálogo
  assert.deepEqual(layout.shelves.map((s) => s.productId), elig.map((p) => p.id));
  return layout;
}

test('10 produtos → 2 módulos de 5', () => {
  const layout = checkInvariants(make(10));
  assert.deepEqual(layout.modules.map((m) => m.shelves.length), [5, 5]);
});

test('9 produtos (1 indisponível) → 5 + 4', () => {
  const layout = checkInvariants(make(10, [10]));
  assert.deepEqual(layout.modules.map((m) => m.shelves.length), [5, 4]);
  assert.ok(!layout.shelves.some((s) => s.productId === 'p10'));
});

test('remover até 5 prateleiras compacta para 1 módulo', () => {
  const removidos = new Set(['p2', 'p4', 'p6', 'p8']);
  const layout = checkInvariants(make(10, [10]), removidos);
  assert.equal(layout.moduleCount, 1);
  assert.deepEqual(layout.shelves.map((s) => s.productId), ['p1', 'p3', 'p5', 'p7', 'p9']);
});

test('invariantes para qualquer quantidade de 0 a 12', () => {
  for (let n = 0; n <= 12; n++) checkInvariants(make(n));
});

test('módulos centralizados na origem', () => {
  const layout = computeLayout(make(10));
  assert.deepEqual(layout.modules.map((m) => m.x), [-0.5, 0.5]);
  assert.deepEqual(computeLayout(make(3)).modules.map((m) => m.x), [0]);
});

test('pilha centralizada e passo limitado por PITCH_MAX', () => {
  const five = computeLayout(make(5)).modules[0].shelves;
  assert.ok(Math.abs(five[0].y - LAYOUT.TOP) < EPS);
  assert.ok(Math.abs(five[4].y - LAYOUT.BOTTOM) < EPS);
  const two = computeLayout(make(2)).modules[0].shelves;
  assert.ok(Math.abs(two[0].y - two[1].y - LAYOUT.PITCH_MAX) < EPS);
  const mid = (LAYOUT.TOP + LAYOUT.BOTTOM) / 2;
  assert.ok(Math.abs((two[0].y + two[1].y) / 2 - mid) < EPS);
  assert.ok(Math.abs(computeLayout(make(1)).shelves[0].y - mid) < EPS);
});

test('respeita `ordem` mesmo com array embaralhado', () => {
  const produtos = make(4).reverse();
  assert.deepEqual(computeLayout(produtos).shelves.map((s) => s.productId), ['p1', 'p2', 'p3', 'p4']);
});

test('canRemove: RV-01 e RV-02', () => {
  const produtos = make(3, [3]);
  assert.equal(canRemove(produtos, new Set(), 'p1').ok, true);
  assert.equal(canRemove(produtos, new Set(), 'p3').ok, false, 'indisponível');
  assert.equal(canRemove(produtos, new Set(['p1']), 'p1').ok, false, 'já removido');
  assert.equal(canRemove(produtos, new Set(), 'nao-existe').ok, false);
  const ultima = canRemove(produtos, new Set(['p1']), 'p2');
  assert.equal(ultima.ok, false);
  assert.match(ultima.motivo, /ao menos uma prateleira/);
});

test('todos indisponíveis → 1 módulo vazio', () => {
  const layout = computeLayout(make(3, [1, 2, 3]));
  assert.equal(layout.moduleCount, 1);
  assert.equal(layout.shelves.length, 0);
});
