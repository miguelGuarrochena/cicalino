import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Conexion a Neon Postgres sobre HTTP (ideal para serverless / edge de Next).
// DATABASE_URL debe apuntar al endpoint con pooling de Neon.
if (!process.env.DATABASE_URL) {
  throw new Error("Falta la variable de entorno DATABASE_URL");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export { schema };
