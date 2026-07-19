import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; disable for local dev via env flag.
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
