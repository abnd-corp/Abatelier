import { isIP } from 'node:net'

/** Adresse du réseau local (ou de la machine elle-même) : jamais routée sur internet. */
export function isPrivateIp(ip: string | undefined) {
  if (!ip) return false
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number]
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (isIP(ip) === 6) {
    const low = ip.toLowerCase()
    return low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80:')
  }
  return false
}
