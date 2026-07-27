import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var boyanPool: Pool | undefined;
}

function getPool() {
  if (global.boyanPool) return global.boyanPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  const pool = new Pool({
    connectionString,
    max: 10,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  if (process.env.NODE_ENV !== "production") global.boyanPool = pool;
  return pool;
}

export const db = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return getPool().query<T>(text, values);
  },
};
