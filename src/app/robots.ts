import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/appUrl";

/* Marketing indexable; panel, admin, QR y APIs fuera del índice. */
export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/panel",
          "/panel/",
          "/admin",
          "/admin/",
          "/api/",
          "/aceptar/",
          "/p/",
          "/e/",
          "/login",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
