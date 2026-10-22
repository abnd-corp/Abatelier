import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// Les tests marqués @responsive tournent aussi sur téléphone et tablette.
// Les autres parcours supposent un écran d'ordinateur (menu toujours visible).
const RESPONSIVE = /@responsive/

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8090',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Téléphone Android : écran tactile, 412 px de large
    { name: 'telephone', grep: RESPONSIVE, use: { ...devices['Pixel 7'] } },
    // Tablette en portrait (taille d'iPad), moteur Chromium
    { name: 'tablette', grep: RESPONSIVE, use: { ...devices['iPad (gen 7)'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
})
