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
  const g = produtos[0].garrafa;
  assert.equal(g.formato, BOTTLE_DEFAULTS.formato);
  assert.equal(g.profundidade, g.largura);
  assert.deepEqual(g.ombro, [0.6, 0.74]);
  assert.equal(g.tampa, 'capsula');
  assert.equal(produtos[1].garrafa.formato, 'redonda');
  assert.equal(produtos[1].garrafa.altura, 0.25);
});

test('ombro aceita enum ou [início, fim] e rejeita intervalo inválido', () => {
  const { produtos } = parseCatalog(wrap([
    product({ id: 'a', garrafa: { ombro: 'alto' } }),
    product({ id: 'b', garrafa: { ombro: [0.55, 0.7] } }),
    product({ id: 'c', garrafa: { ombro: [0.8, 0.7] } }),
    product({ id: 'd', garrafa: { ombro: [0.1, 0.99] } }),
  ]));
  assert.deepEqual(produtos[0].garrafa.ombro, [0.7, 0.8]);
  assert.deepEqual(produtos[1].garrafa.ombro, [0.55, 0.7]);
  assert.deepEqual(produtos[2].garrafa.ombro, [0.6, 0.74], 'fim ≤ início → padrão');
  assert.deepEqual(produtos[3].garrafa.ombro, [0.4, 0.9], 'fora da faixa → limitado');
});

test('gargalo, fundo, tampa e cápsula são normalizados', () => {
  const { produtos } = parseCatalog(wrap([
    product({ id: 'a', garrafa: { raioGargalo: 0.5, fundo: -1, tampa: 'rolha-vidro', capsula: { inicio: 0.3, cor: '#ABCDEF', metalica: 1 } } }),
    product({ id: 'b', garrafa: { corTampa: '#123456' } }),
  ]));
  const a = produtos[0].garrafa;
  assert.equal(a.raioGargalo, 0.025);
  assert.equal(a.fundo, 0.005);
  assert.equal(a.tampa, 'rolha-vidro');
  assert.deepEqual(a.capsula, { inicio: 0.6, cor: '#ABCDEF', metalica: false });
  assert.equal(produtos[1].garrafa.capsula.cor, '#123456', 'corTampa legado vira cor da cápsula');
});

test('rótulo: estilo, destaque e textos', () => {
  const { produtos } = parseCatalog(wrap([
    product({ id: 'a', rotulo: { estilo: 'jameson', destaque: '#1e5a38', textos: { linha: 'ok', n: 3, vazio: '' } } }),
    product({ id: 'b', garrafa: { corLiquido: '#aa5500' } }),
    product({ id: 'c', rotulo: { estilo: 'Estilo Inválido!', destaque: 'verde' } }),
  ]));
  assert.deepEqual(produtos[0].rotulo, { estilo: 'jameson', destaque: '#1e5a38', textos: { linha: 'ok' } });
  assert.deepEqual(produtos[1].rotulo, { estilo: 'generico', destaque: '#aa5500', textos: {} });
  assert.equal(produtos[2].rotulo.estilo, 'generico');
});

test('catálogo real: cada whisky tem estilo de rótulo próprio e cápsula no gargalo', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/whiskies.json', import.meta.url), 'utf8'));
  const { produtos } = parseCatalog(raw);
  const estilos = new Set(produtos.map((p) => p.rotulo.estilo));
  assert.equal(estilos.size, 10);
  assert.ok(!estilos.has('generico'));
  for (const p of produtos) {
    assert.ok(p.garrafa.ombro[0] < p.garrafa.ombro[1], p.id);
    assert.ok(p.garrafa.capsula.inicio > p.garrafa.ombro[0], `${p.id}: cápsula acima do ombro`);
  }
  assert.equal(produtos.find((p) => p.id === 'hibiki-harmony').garrafa.tampa, 'rolha-vidro');
  assert.equal(produtos.find((p) => p.id === 'jameson').garrafa.corVidro, '#3f6e32');
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
