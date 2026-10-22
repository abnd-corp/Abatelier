// Applique les migrations (schéma et catalogue de départ) sur la base, puis s'arrête : sert à « scripts/bdd.sh ».
import { pool, runMigrations } from './db/index.js'

await runMigrations()
await pool.end()
