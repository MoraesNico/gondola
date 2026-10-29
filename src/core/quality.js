// Qualidade adaptativa (dicas 68 e 80 do guia de otimização): observa o tempo de quadro
// enquanto a cena anima e troca de nível quando o aparelho sofre ou sobra folga.
// Módulo puro: o renderer aplica o nível; aqui só fica a decisão, testada em node --test.

export const QUALITY_TIERS = Object.freeze([
  { id: 'baixa', pixelRatio: 1, shadowMapSize: 1024, transmissionScale: 0.35 },
  { id: 'media', pixelRatio: 1.5, shadowMapSize: 1024, transmissionScale: 0.5 },
  { id: 'alta', pixelRatio: 2, shadowMapSize: 2048, transmissionScale: 0.5 },
]);

const ALIASES = { low: 'baixa', medium: 'media', high: 'alta', baixa: 'baixa', media: 'media', alta: 'alta' };

// `?quality=low|medium|high` (ou baixa|media|alta) força e trava um nível.
export function parseQualityParam(search) {
  const value = new URLSearchParams(search).get('quality');
  return value ? ALIASES[value.toLowerCase()] ?? null : null;
}

export function createQualityController({
  start = 'alta',
  locked = false,
  down = 28, // ms — média acima disso desce um nível (~35 fps)
  up = 12, // ms — média abaixo disso sobe um nível (folga acima de 80 fps)
  window = 45, // quadros por decisão
  maxSwitches = 3, // "flipflops": depois disso o nível fica fixo
} = {}) {
  let index = Math.max(0, QUALITY_TIERS.findIndex((t) => t.id === start));
  let samples = [];
  let switches = 0;

  return {
    get tier() { return QUALITY_TIERS[index]; },
    get locked() { return locked; },

    // Recebe a duração de um quadro em ms; devolve o id do novo nível quando muda.
    sample(ms) {
      if (locked || !(ms > 0) || ms > 250) return null; // descarta pausas (aba oculta, GC)
      samples.push(ms);
      if (samples.length < window) return null;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      samples = [];
      let next = index;
      if (avg > down && index > 0) next = index - 1;
      else if (avg < up && index < QUALITY_TIERS.length - 1) next = index + 1;
      if (next === index) return null;
      index = next;
      if (++switches >= maxSwitches) locked = true;
      return QUALITY_TIERS[index].id;
    },
  };
}
