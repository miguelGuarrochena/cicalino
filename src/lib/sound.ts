// Sonidos y vibración de avisos del mostrador (sin archivos: WebAudio).
// El navegador deja AudioContext en "suspended" hasta un gesto del usuario.
// Por eso el toggle de sonido (y cualquier click del panel) llama unlockAudio().

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

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = ctx || new AC();
    return ctx;
  } catch {
    return null;
  }
};

/** Desbloquea WebAudio (llamar desde un click). */
export const unlockAudio = async (): Promise<boolean> => {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    return c.state === "running";
  } catch {
    return false;
  }
};

const tono = (freq: number, ms: number, delay = 0) => {
  if (isSoundMuted() || typeof window === "undefined") return;
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g);
    g.connect(c.destination);
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

/** Beep corto para probar / confirmar que el audio está activo. */
export const dingPrueba = () => {
  tono(880, 100);
};

// Pedido nuevo: un "ding" corto.
export const dingNuevo = () => {
  tono(660, 120);
  vibrate(50);
};

// Pedido listo (aviso al cliente): dos notas ascendentes + vibración.
export const notifyReady = () => {
  tono(988, 150);
  tono(1319, 190, 0.13);
  vibrate([120, 60, 120]);
};

// Cliente canceló espera/pedido: tono grave corto.
export const dingCancelado = () => {
  tono(392, 140);
  tono(294, 180, 0.12);
  vibrate([80, 40, 80]);
};
