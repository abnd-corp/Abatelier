import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { fileURLToPath } from 'node:url'
import { env } from '../env.js'
import * as schema from './schema.js'

export const pool = new pg.Pool({ connectionString: env.databaseUrl })
export const db = drizzle(pool, { schema })

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations() {
  await migrate(db, { migrationsFolder })
}
