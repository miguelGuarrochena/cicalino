import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit corre fuera de Next, así que no lee .env.local solo:
// lo cargamos explícitamente (primero .env.local, luego .env como fallback).
loadEnv({ path: ".env.local" });
loadEnv();

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Verbose para ver el SQL generado en las migraciones.
  verbose: true,
  strict: true,
});
