import pg from 'pg'

/** Crée la base de test si besoin et applique les migrations, une fois avant tous les tests. */
export default async function setup() {
  const { env } = await import('../src/env.js')
  const url = new URL(env.databaseUrl)
  const dbName = decodeURIComponent(url.pathname.slice(1))
  if (!dbName.endsWith('_test')) throw new Error(`Refus de lancer les tests sur « ${dbName} » : le nom de la base doit finir par _test.`)

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const client = new pg.Client({ connectionString: adminUrl.toString() })
  await client.connect()
  const exists = await client.query('select 1 from pg_database where datname = $1', [dbName])
  if (!exists.rowCount) await client.query(`create database "${dbName.replace(/"/g, '')}"`)
  await client.end()

  const { runMigrations, pool } = await import('../src/db/index.js')
  await runMigrations()
  await pool.end()
}
