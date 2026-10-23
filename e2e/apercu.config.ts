import { defineConfig, devices } from '@playwright/test'

// Captures d'écran de toutes les pages, pour vérifier les rendus à l'œil : make apercu
// Résultat : apercus/index.html à la racine du projet.
const SIZES = {
  telephone: devices['Pixel 7'],
  tablette: { ...devices['iPad (gen 7)'], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const },
  'tablette-paysage': { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const },
  ordinateur: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
}

export default defineConfig({
  testDir: './apercu',
  // Attendre la stack, puis ajouter les données de démonstration une seule fois
  globalSetup: ['./global-setup.ts', './apercu/donnees-demo.ts'],
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8090', locale: 'fr-FR' },
  projects: Object.entries(SIZES).flatMap(([name, use]) =>
    (['clair', 'sombre'] as const).map((theme) => ({
      name: `${name}-${theme}`,
      use: { ...use, colorScheme: theme === 'clair' ? ('light' as const) : ('dark' as const) },
    })),
  ),
})
