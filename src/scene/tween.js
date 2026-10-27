// Interpolação mínima com easing — evita uma dependência só para animar o rearranjo.

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Tweener {
  constructor() {
    this.active = new Set();
  }

  // onUpdate(k) recebe o progresso já suavizado (0 → 1). Devolve uma Promise resolvida ao fim
  // ou no cancelamento; `cancel()` interrompe sem chamar o último quadro.
  run(duration, onUpdate, { ease = easeInOutCubic } = {}) {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const tween = { elapsed: 0, duration: Math.max(1e-3, duration), onUpdate, ease, resolve };
    this.active.add(tween);
    promise.cancel = () => {
      if (this.active.delete(tween)) resolve(false);
    };
    return promise;
  }

  // Avança todas as animações; devolve true se ainda houver alguma em andamento.
  update(dt) {
    for (const t of this.active) {
      t.elapsed += dt;
      const k = Math.min(1, t.elapsed / t.duration);
      t.onUpdate(t.ease(k));
      if (k >= 1) {
        this.active.delete(t);
        t.resolve(true);
      }
    }
    return this.active.size > 0;
  }
}
