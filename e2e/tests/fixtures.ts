import { readFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

export { expect }

export const ADMIN = {
  identifiant: process.env.E2E_ADMIN_IDENTIFIANT ?? 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? readFileSync(new URL('../../secrets/admin_password.txt', import.meta.url), 'utf8').trim(),
}

export const NEW_PASSWORD = 'Tole-pliee-bleu-42'

/** Connexion par l'API : le cookie est partagé avec la page (même contexte de navigateur). */
export async function apiLogin(request: APIRequestContext, baseURL: string, identifiant: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { identifiant, password }, headers: { Origin: baseURL } })
  expect(res.status(), await res.text()).toBe(200)
}

export async function createUser(request: APIRequestContext, baseURL: string, user: { identifiant: string; nom: string; role?: 'direction' | 'rh' | 'atelier' }) {
  const res = await request.post('/api/users', { data: { role: 'atelier', ...user }, headers: { Origin: baseURL } })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).tempPassword as string
}

/** Remplit et envoie le formulaire de connexion. */
export async function uiLogin(page: Page, identifiant: string, password: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

export const test = base.extend<{ uid: string; adminPage: Page }>({
  // Identifiant unique par test : les tests tournent en parallèle sur la même base
  uid: async ({}, use, testInfo) => {
    await use(`e2e-${testInfo.project.name.slice(0, 2)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
  },
  adminPage: async ({ page, baseURL }, use) => {
    await apiLogin(page.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    await use(page)
  },
})

/** Image PNG unie de la taille voulue, fabriquée à la main (pour tester les envois de photos). */
export function makePng(width: number, height: number, grey = 0x7b) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, grey)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// --- Boîte de réception de test (Mailpit) : tous les e-mails de l'application s'y arrêtent ---
const MAIL = `http://localhost:${process.env.E2E_MAIL_PORT ?? '8091'}`

export interface Mail {
  ID: string
  Subject: string
  Text: string
  To: { Address: string }[]
  ReplyTo: { Address: string }[]
  Attachments: { PartID: string; FileName: string; ContentType: string }[]
}

/** Attend le message dont l'objet contient `fragment` (unique par test) et le renvoie en entier. */
export async function waitForMail(request: APIRequestContext, fragment: string): Promise<Mail> {
  let found: { ID: string } | undefined
  await expect
    .poll(async () => {
      const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`subject:"${fragment}"`)}`)
      found = (await res.json()).messages?.[0]
      return Boolean(found)
    }, { message: `Aucun e-mail dont l'objet contient « ${fragment} »`, timeout: 10_000 })
    .toBe(true)
  return (await request.get(`${MAIL}/api/v1/message/${found!.ID}`)).json()
}

/** Contenu d'une pièce jointe d'un message. */
export async function mailPart(request: APIRequestContext, mail: Mail, partId: string) {
  return Buffer.from(await (await request.get(`${MAIL}/api/v1/message/${mail.ID}/part/${partId}`)).body())
}

/** Nombre de messages dont l'objet contient `fragment`. */
export async function countMails(request: APIRequestContext, fragment: string) {
  const res = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`subject:"${fragment}"`)}`)
  return ((await res.json()).messages ?? []).length as number
}
