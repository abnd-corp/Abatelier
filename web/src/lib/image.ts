/** Réduit une photo à 1600 px au plus grand côté et la recompresse en JPEG (le serveur refuse plus de 3 Mo). */
export async function resizePhoto(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('Image illisible : choisissez une photo JPEG ou PNG.')
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Ce navigateur ne peut pas préparer la photo.')
  // Fond blanc : un PNG transparent ne devient pas noir en JPEG
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Préparation de la photo impossible.')
  return blob
}
