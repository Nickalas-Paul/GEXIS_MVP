import './env';
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err);
});

export let databaseReady = false;

export async function verifyDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    databaseReady = true;
    console.log(`[db] Connected successfully at ${result.rows[0].now}`);
    return true;
  } catch (err) {
    databaseReady = false;
    console.error('[db] Connection failed:', err);
    return false;
  }
}
