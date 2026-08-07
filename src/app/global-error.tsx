"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/* Última red del App Router: acá caen los errores del layout raíz y los del
 * render de React, que no pasan por ningún reportError nuestro. */
const GlobalError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
  <html lang="es-AR">
    <body
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        background: "#f4f1da",
        color: "#20264f",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>Algo salió mal</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        Volvé a intentar en un momento.
      </p>
      <button
        onClick={reset}
        style={{
          border: "none",
          borderRadius: 999,
          background: "#2536d4",
          color: "#f4f1da",
          fontWeight: 600,
          padding: "12px 24px",
          cursor: "pointer",
        }}
      >
        Reintentar
      </button>
    </body>
    </html>
  );
};

export default GlobalError;
