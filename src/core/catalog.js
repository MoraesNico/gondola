// Leitura e validação do catálogo (data/whiskies.json).
// Módulo puro: sem three.js nem DOM, para rodar no navegador e no `node --test`.

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogError';
  }
}

export const BOTTLE_SHAPES = ['redonda', 'quadrada', 'frasco', 'facetada'];
export const CLOSURES = ['capsula', 'rolha-vidro'];
// Posição do ombro (início e fim da curva, em fração da altura) para os nomes legados.
export const SHOULDERS = { alto: [0.7, 0.8], medio: [0.6, 0.74], baixo: [0.52, 0.7] };

export const BOTTLE_DEFAULTS = Object.freeze({
  formato: 'redonda',
  altura: 0.29,
  largura: 0.082,
  ombro: SHOULDERS.medio,
  raioGargalo: 0.0135,
  fundo: 0.02,
  tampa: 'capsula',
  corVidro: '#f3f1ea',
  corLiquido: '#a8581c',
  corRotulo: '#efe6d0',
  corTextoRotulo: '#2b2b2b',
});
const CAPSULE_DEFAULT = Object.freeze({ inicio: 0.82, cor: '#1e1e1e', metalica: false });

const ID_RE = /^[a-z0-9-]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const hex = (v, fallback) => (typeof v === 'string' && HEX_RE.test(v) ? v : fallback);

// RV-03 — devolve a lista de motivos pelos quais o item não pode entrar no catálogo.
function validateProduct(p) {
  const motivos = [];
  if (!p || typeof p !== 'object') return ['item não é um objeto'];
  if (!isNonEmptyString(p.id) || !ID_RE.test(p.id)) motivos.push('id ausente ou fora do padrão [a-z0-9-]');
  if (!isNonEmptyString(p.nome)) motivos.push('nome obrigatório');
  if (!isNonEmptyString(p.descricao)) motivos.push('descricao obrigatória');
  if (!isFiniteNumber(p.preco) || p.preco < 0) motivos.push('preco deve ser número ≥ 0');
  if (!isFiniteNumber(p.teorAlcoolico) || p.teorAlcoolico < 0 || p.teorAlcoolico > 100) {
    motivos.push('teorAlcoolico deve estar entre 0 e 100');
  }
  if (typeof p.disponivel !== 'boolean') motivos.push('disponivel deve ser true ou false');
  return motivos;
}

function normalizeShoulder(v) {
  if (typeof v === 'string' && SHOULDERS[v]) return [...SHOULDERS[v]];
  if (Array.isArray(v) && v.length === 2 && v.every(isFiniteNumber)) {
    const a = clamp(v[0], 0.4, 0.9);
    const b = clamp(v[1], 0.4, 0.9);
    if (b > a) return [a, b];
  }
  return [...BOTTLE_DEFAULTS.ombro];
}

function normalizeBottle(raw) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const b = { ...BOTTLE_DEFAULTS };
  if (BOTTLE_SHAPES.includes(g.formato)) b.formato = g.formato;
  if (CLOSURES.includes(g.tampa)) b.tampa = g.tampa;
  if (isFiniteNumber(g.altura)) b.altura = clamp(g.altura, 0.18, 0.36);
  if (isFiniteNumber(g.largura)) b.largura = clamp(g.largura, 0.06, 0.12);
  if (isFiniteNumber(g.raioGargalo)) b.raioGargalo = clamp(g.raioGargalo, 0.009, 0.025);
  if (isFiniteNumber(g.fundo)) b.fundo = clamp(g.fundo, 0.005, 0.12);
  b.profundidade = isFiniteNumber(g.profundidade) ? clamp(g.profundidade, 0.03, 0.12) : b.largura;
  b.ombro = normalizeShoulder(g.ombro);
  for (const key of ['corVidro', 'corLiquido', 'corRotulo', 'corTextoRotulo']) b[key] = hex(g[key], b[key]);

  const c = g.capsula && typeof g.capsula === 'object' ? g.capsula : {};
  b.capsula = {
    inicio: isFiniteNumber(c.inicio) ? clamp(c.inicio, 0.6, 0.95) : CAPSULE_DEFAULT.inicio,
    cor: hex(c.cor, hex(g.corTampa, CAPSULE_DEFAULT.cor)), // corTampa: campo da versão 1
    metalica: c.metalica === true,
  };
  return b;
}

const STYLE_RE = /^[a-z0-9-]+$/;

function normalizeLabel(raw, garrafa) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const textos = {};
  if (r.textos && typeof r.textos === 'object') {
    for (const [k, v] of Object.entries(r.textos)) if (isNonEmptyString(v)) textos[k] = v;
  }
  return {
    estilo: typeof r.estilo === 'string' && STYLE_RE.test(r.estilo) ? r.estilo : 'generico',
    destaque: hex(r.destaque, garrafa.corLiquido),
    textos,
  };
}

const strings = (v) => (Array.isArray(v) ? v.filter(isNonEmptyString) : []);
const text = (v) => (isNonEmptyString(v) ? v.trim() : '');

export function parseCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CatalogError('O catálogo deve ser um objeto JSON.');
  }
  if (!Array.isArray(raw.produtos)) {
    throw new CatalogError('O catálogo precisa de uma lista "produtos".');
  }

  const exp = raw.expositor ?? {};
  const expositor = {
    nome: text(exp.nome) || 'Gôndola',
    categoria: text(exp.categoria),
    moeda: typeof exp.moeda === 'string' && /^[A-Z]{3}$/.test(exp.moeda) ? exp.moeda : 'BRL',
    atualizadoEm: text(exp.atualizadoEm),
  };

  const seen = new Set();
  const produtos = [];
  const invalidos = [];

  raw.produtos.forEach((p, index) => {
    const motivos = validateProduct(p);
    const id = typeof p?.id === 'string' ? p.id : undefined;
    if (!motivos.length && seen.has(id)) motivos.push('id duplicado');
    if (motivos.length) {
      invalidos.push({ index, id, motivos });
      return;
    }
    seen.add(id);
    produtos.push({
      id,
      ordem: Number.isInteger(p.ordem) && p.ordem >= 1 ? p.ordem : index + 1,
      nome: p.nome.trim(),
      marca: text(p.marca),
      tipo: text(p.tipo),
      pais: text(p.pais),
      regiao: text(p.regiao),
      idade: text(p.idade),
      volumeMl: Number.isInteger(p.volumeMl) && p.volumeMl > 0 ? p.volumeMl : null,
      teorAlcoolico: p.teorAlcoolico,
      preco: p.preco,
      descricao: p.descricao.trim(),
      notas: strings(p.notas),
      harmonizacao: strings(p.harmonizacao),
      disponivel: p.disponivel,
      garrafa: normalizeBottle(p.garrafa),
      rotulo: null,
      _index: index,
    });
  });

  // Ordem estável: `ordem`, depois posição original no arquivo.
  produtos.sort((a, b) => a.ordem - b.ordem || a._index - b._index);
  for (const p of produtos) {
    p.rotulo = normalizeLabel(raw.produtos[p._index].rotulo, p.garrafa);
    delete p._index;
  }

  return { expositor, produtos, invalidos };
}

export function formatPrice(value, moeda = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(value);
}
