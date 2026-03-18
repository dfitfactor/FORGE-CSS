import { Pool, PoolClient } from 'pg'

declare global {
  var _pgPool: Pool | undefined
}

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'forge_css',
    user: process.env.POSTGRES_USER || 'forge_admin',
    password: process.env.POSTGRES_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }
}

function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool(buildConfig())
    global._pgPool.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
    })
  }
  return global._pgPool
}

export const db = {
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const pool = getPool()
    const result = await pool.query(sql, params)
    return result.rows as T[]
  },

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null> {
    const rows = await db.query<T>(sql, params)
    return rows[0] ?? null
  },

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  // Set RLS context for row-level security
  async withContext(userId: string, userRole: string, callback: () => Promise<void>) {
    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query(`SET LOCAL app.current_user_id = '${userId}'`)
      await client.query(`SET LOCAL app.current_user_role = '${userRole}'`)
      await callback()
    } finally {
      client.release()
    }
  }
}

export type QueryResult<T> = {
  data: T | null
  error: string | null
}

export async function safeQuery<T>(
  fn: () => Promise<T>
): Promise<QueryResult<T>> {
  try {
    const data = await fn()
    return { data, error: null }
  } catch (err) {
    console.error('Database error:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Database error'
    }
  }
}
