
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

const tone = (freq: number, ms: number, delay = 0) => {
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
  }
};

export const vibrate = (pattern: number | number[] = 120) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
  }
};

export const dingTest = () => {
  tone(880, 100);
};

export const dingNew = () => {
  tone(660, 120);
  vibrate(50);
};

export const notifyReady = () => {
  tone(988, 150);
  tone(1319, 190, 0.13);
  vibrate([120, 60, 120]);
};

export const dingCancelled = () => {
  tone(392, 140);
  tone(294, 180, 0.12);
  vibrate([80, 40, 80]);
};
