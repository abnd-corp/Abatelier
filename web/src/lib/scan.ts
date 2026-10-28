// Lecture de codes-barres avec la caméra du téléphone. Le navigateur a parfois son propre détecteur (Chrome sur Android) ;
// ailleurs (iPhone, Firefox, ordinateur) on utilise la bibliothèque zxing, copiée dans l'application : rien n'est chargé depuis internet.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']

/** La caméra n'est accessible qu'en connexion sécurisée (HTTPS, ou localhost). */
export const cameraAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

async function makeDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (native) return new native({ formats: FORMATS })
  const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill')
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) })
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector
}

export class ScanError extends Error {}

/** Ouvre la caméra arrière dans la vidéo, et appelle `onCode` au premier code lu. Renvoie la fonction qui coupe la caméra. */
export async function startScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  if (!cameraAvailable()) throw new ScanError('La caméra demande une connexion sécurisée (https). Saisissez le code à la main.')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  } catch (e) {
    const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    throw new ScanError(denied ? 'Caméra refusée : autorisez-la pour ce site dans le navigateur, puis relancez. Sinon, saisissez le code.' : 'Aucune caméra disponible : saisissez le code à la main.')
  }
  let detector: Detector
  try {
    detector = await makeDetector()
  } catch {
    for (const t of stream.getTracks()) t.stop()
    throw new ScanError('Le lecteur de codes-barres n’a pas pu démarrer : saisissez le code à la main.')
  }
  video.srcObject = stream
  await video.play().catch(() => {})
  let stopped = false
  const stop = () => {
    stopped = true
    for (const t of stream.getTracks()) t.stop()
    video.srcObject = null
  }
  const loop = async () => {
    if (stopped) return
    try {
      const found = await detector.detect(video)
      const value = found[0]?.rawValue?.trim()
      if (value) {
        stop()
        onCode(value)
        return
      }
    } catch {
      // image pas encore prête : on réessaie
    }
    setTimeout(loop, 200)
  }
  loop()
  return stop
}
