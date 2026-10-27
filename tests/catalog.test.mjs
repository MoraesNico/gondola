import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCatalog, CatalogError, BOTTLE_DEFAULTS } from '../src/core/catalog.js';

const product = (over = {}) => ({
  id: 'teste',
  nome: 'Teste',
  descricao: 'Descrição',
  preco: 100,
  teorAlcoolico: 40,
  disponivel: true,
  ...over,
});

const wrap = (produtos) => ({ expositor: { nome: 'G', categoria: 'Whisky' }, produtos });

test('o catálogo real é válido e tem os 10 whiskies pedidos', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/whiskies.json', import.meta.url), 'utf8'));
  const { produtos, invalidos, expositor } = parseCatalog(raw);
  assert.equal(invalidos.length, 0, JSON.stringify(invalidos));
  assert.equal(produtos.length, 10);
  assert.equal(expositor.moeda, 'BRL');
  const nomes = produtos.map((p) => p.nome).join(' | ');
  for (const marca of ['Buffalo Trace', 'Woodford Reserve', "Jack Daniel's", 'Jameson', 'Chivas Regal',
    'Hibiki', 'Johnnie Walker', "Ballantine's", 'Macallan', 'Glenlivet Caribbean Reserve']) {
    assert.ok(nomes.includes(marca), `faltando ${marca}`);
  }
  for (const p of produtos) assert.equal(typeof p.disponivel, 'boolean');
});

test('ordena por `ordem` e usa a posição no array quando ausente', () => {
  const { produtos } = parseCatalog(wrap([
    product({ id: 'c', ordem: 3 }),
    product({ id: 'b' }), // índice 1 → ordem 2
    product({ id: 'a', ordem: 1 }),
  ]));
  assert.deepEqual(produtos.map((p) => p.id), ['a', 'b', 'c']);
});

test('RV-03: descarta itens sem campos obrigatórios ou com tipos errados', () => {
  const { produtos, invalidos } = parseCatalog(wrap([
    product({ id: 'ok' }),
    product({ id: 'sem-nome', nome: '' }),
    product({ id: 'disp-string', disponivel: 'true' }),
    product({ id: 'preco-negativo', preco: -1 }),
    product({ id: 'abv-alto', teorAlcoolico: 120 }),
    product({ id: 'Id Inválido' }),
    { nome: 'sem id' },
  ]));
  assert.deepEqual(produtos.map((p) => p.id), ['ok']);
  assert.equal(invalidos.length, 6);
  const disp = invalidos.find((i) => i.id === 'disp-string');
  assert.match(disp.motivos.join(), /disponivel/);
});

test('RV-03: ids duplicados — a primeira ocorrência vence', () => {
  const { produtos, invalidos } = parseCatalog(wrap([
    product({ id: 'x', nome: 'Primeiro' }),
    product({ id: 'x', nome: 'Segundo' }),
  ]));
  assert.equal(produtos.length, 1);
  assert.equal(produtos[0].nome, 'Primeiro');
  assert.match(invalidos[0].motivos[0], /duplicado/);
});

test('completa a garrafa com defaults e corrige formato desconhecido', () => {
  const { produtos } = parseCatalog(wrap([
    product({ id: 'a' }),
    product({ id: 'b', garrafa: { formato: 'triangular', altura: 0.25 } }),
  ]));
  assert.deepEqual(produtos[0].garrafa, { ...BOTTLE_DEFAULTS, profundidade: BOTTLE_DEFAULTS.largura });
  assert.equal(produtos[1].garrafa.formato, 'redonda');
  assert.equal(produtos[1].garrafa.altura, 0.25);
});

test('normaliza listas opcionais e moeda', () => {
  const { produtos, expositor } = parseCatalog({ expositor: { nome: 'G', categoria: 'C' }, produtos: [product()] });
  assert.deepEqual(produtos[0].notas, []);
  assert.deepEqual(produtos[0].harmonizacao, []);
  assert.equal(expositor.moeda, 'BRL');
});

test('estrutura inválida lança CatalogError', () => {
  assert.throws(() => parseCatalog(null), CatalogError);
  assert.throws(() => parseCatalog({ produtos: {} }), CatalogError);
  assert.throws(() => parseCatalog('texto'), CatalogError);
});
