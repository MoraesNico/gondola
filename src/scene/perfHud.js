// Painel de desempenho (`?perf`): draw calls, triângulos, memória e nível de qualidade
// lidos de renderer.info (dica 94 do guia). Atualiza 2× por segundo, fora do loop de render.

export function createPerfHud(view, { textures = () => '—' } = {}) {
  const el = document.createElement('aside');
  el.className = 'perf-hud';
  el.setAttribute('aria-label', 'Desempenho');
  document.body.append(el);

  const { renderer } = view;
  // renderer.info.render.frame conta os quadros realmente desenhados (o loop é sob demanda).
  let lastFrame = renderer.info.render.frame;
  let last = performance.now();

  setInterval(() => {
    const now = performance.now();
    const fps = Math.round(((renderer.info.render.frame - lastFrame) * 1000) / (now - last));
    lastFrame = renderer.info.render.frame;
    last = now;
    const i = renderer.info;
    const rows = [
      ['QUADROS', fps ? `${fps} FPS` : 'PARADO (SOB DEMANDA)'],
      ['RENDER', `${view.lastFrameMs.toFixed(1)} MS (CPU)`],
      ['DRAW CALLS', i.render.calls],
      ['TRIÂNGULOS', i.render.triangles.toLocaleString('pt-BR')],
      ['GEOMETRIAS', i.memory.geometries],
      ['TEXTURAS', `${i.memory.textures} · ${textures()}`],
      ['PROGRAMAS', i.programs?.length ?? '—'],
      ['QUALIDADE', `${view.tier.id.toUpperCase()}${view.qualityLocked ? ' (FIXA)' : ''} · DPR ${renderer.getPixelRatio()}`],
    ];
    el.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }, 500);
  return el;
}
