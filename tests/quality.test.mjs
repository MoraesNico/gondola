import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_TIERS, createQualityController, parseQualityParam } from '../src/core/quality.js';

const feed = (q, ms, n) => {
  let changed = null;
  for (let i = 0; i < n; i++) changed = q.sample(ms) ?? changed;
  return changed;
};

test('níveis do mais leve ao mais pesado', () => {
  assert.deepEqual(QUALITY_TIERS.map((t) => t.id), ['baixa', 'media', 'alta']);
  for (const t of QUALITY_TIERS) assert.ok(t.pixelRatio >= 1 && t.shadowMapSize >= 512 && t.transmissionScale > 0);
});

test('desce um nível quando a média passa do limite', () => {
  const q = createQualityController({ start: 'alta', window: 10 });
  assert.equal(feed(q, 40, 9), null, 'só decide com a janela cheia');
  assert.equal(q.sample(40), 'media');
  assert.equal(q.tier.id, 'media');
  assert.equal(feed(q, 40, 10), 'baixa');
  assert.equal(feed(q, 40, 10), null, 'não há nível abaixo de baixa');
});

test('sobe quando há folga e ignora picos isolados (aba oculta)', () => {
  const q = createQualityController({ start: 'baixa', window: 10 });
  assert.equal(feed(q, 8, 10), 'media');
  feed(q, 8, 9);
  assert.equal(q.sample(5000), null, 'pico > 250 ms é descartado');
  assert.equal(q.sample(8), 'alta');
});

test('trava depois de 3 trocas (evita oscilar)', () => {
  const q = createQualityController({ start: 'alta', window: 5, maxSwitches: 3 });
  feed(q, 40, 5); // alta → media
  feed(q, 6, 5); // media → alta
  feed(q, 40, 5); // alta → media (3ª troca)
  assert.equal(q.locked, true);
  assert.equal(feed(q, 6, 20), null);
  assert.equal(q.tier.id, 'media');
});

test('nível forçado pela URL fica travado', () => {
  assert.equal(parseQualityParam('?quality=low'), 'baixa');
  assert.equal(parseQualityParam('?perf&quality=alta'), 'alta');
  assert.equal(parseQualityParam('?quality=medium'), 'media');
  assert.equal(parseQualityParam('?x=1'), null);
  const q = createQualityController({ start: 'baixa', locked: true, window: 5 });
  assert.equal(feed(q, 2, 50), null);
});
