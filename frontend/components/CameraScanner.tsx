'use client'
// =============================================================================
// CameraScanner.tsx — Leitor de código de barras via câmera
// Usa BarcodeDetector API nativa (Chrome/Android/Edge) sem dependências externas
// =============================================================================
import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, Zap, AlertCircle, Loader2 } from 'lucide-react'

// ── Declaração de tipo para BarcodeDetector (não incluso no lib TypeScript padrão)
interface BarcodeDetectorResult { rawValue: string; format: string }
interface BarcodeDetectorType {
  detect(source: HTMLVideoElement | HTMLImageElement | ImageBitmap): Promise<BarcodeDetectorResult[]>
}
interface BarcodeDetectorConstructor {
  new(options?: { formats: string[] }): BarcodeDetectorType
  getSupportedFormats(): Promise<string[]>
}
declare const BarcodeDetector: BarcodeDetectorConstructor

interface Props {
  onDetected: (barcode: string) => void
  onClose:    () => void
}

// Formatos suportados
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf']

export default function CameraScanner({ onDetected, onClose }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const detectorRef = useRef<BarcodeDetectorType | null>(null)

  const [error,      setError]      = useState<string | null>(null)
  const [supported,  setSupported]  = useState(true)
  const [scanning,   setScanning]   = useState(false)
  const [lastCode,   setLastCode]   = useState<string | null>(null)
  const [torchOn,    setTorchOn]    = useState(false)
  const [hasTorch,   setHasTorch]   = useState(false)

  // ── Inicia câmera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // Verifica suporte
    if (!('BarcodeDetector' in window)) {
      setSupported(false)
      return
    }

    try {
      // Verifica formatos suportados
      const supportedFmts = await BarcodeDetector.getSupportedFormats()
      const formats       = FORMATS.filter(f => supportedFmts.includes(f))
      if (formats.length === 0) { setSupported(false); return }

      detectorRef.current = new BarcodeDetector({ formats })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream

      // Verifica torch
      const track = stream.getVideoTracks()[0]
      const cap   = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
      if (cap.torch) setHasTorch(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setScanning(true)
        scan()
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? ''
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setError('Permissão de câmera negada. Permita o acesso nas configurações do browser.')
      } else {
        setError('Não foi possível acessar a câmera. Tente usar o leitor USB.')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loop de detecção ──────────────────────────────────────────────────────
  function scan() {
    if (!videoRef.current || !detectorRef.current) return
    const video = videoRef.current
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return }

    detectorRef.current.detect(video).then(barcodes => {
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue
        setLastCode(code)
        // Vibra se disponível
        if (navigator.vibrate) navigator.vibrate(80)
        onDetected(code)
        // Pausa scan 1.5s para evitar leituras duplicadas
        setTimeout(() => { rafRef.current = requestAnimationFrame(scan) }, 1500)
      } else {
        rafRef.current = requestAnimationFrame(scan)
      }
    }).catch(() => {
      rafRef.current = requestAnimationFrame(scan)
    })
  }

  // ── Torch toggle ──────────────────────────────────────────────────────────
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(t => !t)
    } catch { /* torch não disponível */ }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    startCamera()
    return stopCamera
  }, [startCamera])

  // ── Sem suporte ───────────────────────────────────────────────────────────
  if (!supported) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto" />
          <h3 className="text-white font-semibold">Câmera não suportada neste browser</h3>
          <p className="text-gray-400 text-sm">
            Use o Chrome no Android ou Edge no Desktop.<br />
            No iOS, use o leitor USB ou digite o código manualmente.
          </p>
          <button onClick={onClose} className="btn-primary w-full justify-center">Fechar</button>
        </div>
      </div>
    )
  }

  // ── Erro de permissão ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
        <div className="bg-surface-800 border border-surface-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h3 className="text-white font-semibold">Erro ao acessar câmera</h3>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={onClose} className="btn-primary w-full justify-center">Fechar</button>
        </div>
      </div>
    )
  }

  // ── View da câmera ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Overlay de scan */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 h-40">
            {/* Cantos do viewfinder */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-brand-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-brand-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-brand-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-brand-400 rounded-br-lg" />
            {/* Linha animada de scan */}
            <div className="absolute left-2 right-2 h-0.5 bg-brand-400/70 animate-scan-line" />
          </div>
        </div>

        {/* Status */}
        <div className="absolute top-4 left-0 right-0 flex justify-center">
          <div className="bg-black/60 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2">
            {scanning
              ? <><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Escaneando...</>
              : <><Loader2 className="w-4 h-4 animate-spin" /> Iniciando câmera...</>
            }
          </div>
        </div>

        {/* Último código detectado */}
        {lastCode && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="bg-emerald-500/90 text-white text-sm px-4 py-2 rounded-full font-mono">
              ✓ {lastCode}
            </div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="bg-surface-900 p-4 flex items-center justify-between safe-area-bottom">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-700 text-white text-sm font-medium"
        >
          <X className="w-5 h-5" /> Fechar
        </button>

        <p className="text-gray-500 text-xs text-center">
          Aponte para o código de barras
        </p>

        {hasTorch ? (
          <button
            onClick={toggleTorch}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
              torchOn ? 'bg-yellow-500 text-black' : 'bg-surface-700 text-white'
            }`}
          >
            <Zap className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-20" />
        )}
      </div>
    </div>
  )
}

// Adicione ao globals.css ou tailwind.config.js:
// @keyframes scan-line { 0%,100% { top: 4px } 50% { top: calc(100% - 4px) } }
// .animate-scan-line { animation: scan-line 2s ease-in-out infinite; }
