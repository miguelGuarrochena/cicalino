import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los service workers para Web Push se sirven desde /public.
  // Headers para permitir el registro del SW en la vista del cliente.
  /* El módulo se llamaba "mesas" y pasó a llamarse "pagos", que es como se
   * llama internamente desde siempre (`ModuleId`, `local_tiene_modulo`). La
   * ruta vieja queda redirigiendo para siempre: en el salón hay tablets con la
   * pantalla guardada en favoritos o en la pantalla de inicio, y ese link no
   * lo vuelve a crear nadie. 308 conserva el método y lo cachea el navegador.
   *
   * Va en la config y no en el middleware a propósito: los redirects de
   * `next.config` corren ANTES del middleware, así que la URL vieja llega a la
   * protección de sesión ya convertida en la nueva. */
  async redirects() {
    return [
      { source: "/panel/mesas", destination: "/panel/pagos", permanent: true },
      {
        source: "/panel/mesas/:resto*",
        destination: "/panel/pagos/:resto*",
        permanent: true,
      },
    ];
  },

  async headers() {
    // Headers de seguridad para todas las rutas.
    const security = [
      { key: "X-Frame-Options", value: "DENY" }, // anti clickjacking
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "geolocation=(), microphone=(), camera=(), payment=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    return [
      { source: "/:path*", headers: security },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "maicolgua",

  project: "cicalino",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
