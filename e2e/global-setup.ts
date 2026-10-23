import type { FullConfig } from '@playwright/test'

/** Attend que la stack réponde avant de lancer les tests (les containers mettent quelques secondes). */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/health`)
      if (res.ok) return
    } catch {
      // pas encore prête
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`La stack de test ne répond pas sur ${baseURL}. Lancez « make e2e » depuis la racine du projet.`)
}
