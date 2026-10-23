import { afterAll } from 'vitest'
import { pool } from '../src/db/index.js'

afterAll(async () => {
  await pool.end()
})
