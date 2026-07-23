// Sonidos y vibración de avisos del mostrador (sin archivos: WebAudio).
// Se dispara siempre desde un gesto del usuario (click), así respeta el
// autoplay policy de los navegadores.

let ctx: AudioContext | null = null;

export const isSoundMuted = (): boolean => {
  try {
    return localStorage.getItem("cicalino-mute") === "1";
  } catch {
    return false;
  }
};

export const setSoundMuted = (m: boolean) => {
  try {
    localStorage.setItem("cicalino-mute", m ? "1" : "0");
  } catch {
    /* noop */
  }
};

const tono = (freq: number, ms: number, delay = 0) => {
  if (isSoundMuted() || typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = ctx || new AC();
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + ms / 1000);
  } catch {
    /* noop */
  }
};

export const vibrate = (pattern: number | number[] = 120) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
};

// Pedido nuevo: un "ding" corto.
export const dingNuevo = () => {
  tono(660, 120);
  vibrate(50);
};

// Pedido listo (aviso al cliente): dos notas ascendentes + vibración.
export const avisoListo = () => {
  tono(988, 150);
  tono(1319, 190, 0.13);
  vibrate([120, 60, 120]);
};
