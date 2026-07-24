import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los service workers para Web Push se sirven desde /public.
  // Headers para permitir el registro del SW en la vista del cliente.
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

export default nextConfig;
