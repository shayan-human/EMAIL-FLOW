import { Pool } from 'pg';

const globalForDb = global as unknown as { pool: Pool };

export const pool =
  globalForDb.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Limit maximum connections to prevent database exhaustion
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Timeout after 2 seconds if connection cannot be established
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

