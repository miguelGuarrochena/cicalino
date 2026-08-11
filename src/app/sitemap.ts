import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/appUrl";

const RUTAS_PUBLICAS = [
  "/",
  "/pricing",
  "/probar",
  "/faq",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl();
  const ahora = new Date();
  return RUTAS_PUBLICAS.map((path) => ({
    url: path === "/" ? base : `${base}${path}`,
    lastModified: ahora,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
