/* Evita el flash de tema: aplica data-theme e idioma antes de pintar.
 * Vive en /public (no inline) para que la CSP pueda ser estricta con
 * script-src sin necesitar 'unsafe-inline' ni un nonce en el layout. */
(function () {
  try {
    var t = localStorage.getItem("cicalino-theme");
    if (t && t !== "system") {
      document.documentElement.setAttribute("data-theme", t);
    }
    var l = localStorage.getItem("cicalino-lang");
    if (l) document.documentElement.lang = l === "en" ? "en" : "es-AR";
  } catch (_e) {}
})();
