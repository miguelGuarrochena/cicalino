/** Confeti corto al pasar el pedido a listo (solo si el cliente mira la pestaña). */
export const lanzarConfetiListo = async () => {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const confetti = (await import("canvas-confetti")).default;

  const colors = ["#2536d4", "#16a34a", "#f59e0b", "#f4f1da", "#7d8bff"];

  void confetti({
    particleCount: 70,
    spread: 68,
    startVelocity: 32,
    gravity: 1.1,
    ticks: 140,
    origin: { y: 0.55 },
    colors,
    disableForReducedMotion: true,
  });

  // Segundo burst lateral, más chico
  window.setTimeout(() => {
    void confetti({
      particleCount: 35,
      angle: 60,
      spread: 45,
      origin: { x: 0, y: 0.65 },
      colors,
      ticks: 120,
      disableForReducedMotion: true,
    });
    void confetti({
      particleCount: 35,
      angle: 120,
      spread: 45,
      origin: { x: 1, y: 0.65 },
      colors,
      ticks: 120,
      disableForReducedMotion: true,
    });
  }, 180);
};
