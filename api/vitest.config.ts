import { defineConfig } from 'vitest/config'

// Variables posées avant le chargement du code : env.ts les lit à l'import.
// En CI, DATABASE_URL est fournie par le workflow ; en local, on utilise la base du docker compose de dev.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  // Délais et limites abaissés pour que les tests restent rapides
  LOGIN_DELAY_BASE_MS: '5',
  LOGIN_RATE_LIMIT: '30',
  IDLE_TIMEOUT_HOURS: '12',
  SESSION_TTL_DAYS: '30',
  // Aucun appel aux services de l'IGN pendant les tests (voir src/geo.ts)
  GEO_FAKE: '1',
}
if (!process.env.DATABASE_URL) {
  Object.assign(defaults, { DB_HOST: 'localhost', DB_NAME: 'abatelier_test', DB_PASSWORD_FILE: '../secrets/db_password.txt' })
}
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup.ts'],
    // Les fichiers partagent la même base : on les exécute l'un après l'autre
    fileParallelism: false,
    testTimeout: 15000,
  },
})
