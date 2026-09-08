'use client'

import { useEffect } from 'react'
import { usePreferences } from '@/hooks/usePreferences'

const SCRIPT_ID = 'vlibras-plugin-script'
const WRAPPER_ID = 'vlibras-access-wrapper'
const ROOT_URL = 'https://vlibras.gov.br/app'

declare global {
  interface Window {
    VLibras?: {
      Widget: new (options: { rootPath: string; position?: 'L' | 'R' }) => unknown
    }
  }
}

/**
 * O plugin atual cria #vlibras-access-wrapper com Shadow DOM. O seletor antigo
 * `[vw]` não controla mais o botão, por isso ele continuava visível mesmo com a
 * preferência desligada.
 */
function applyPreferences(enabled: boolean, corner: string) {
  const wrapper = document.getElementById(WRAPPER_ID) as HTMLElement | null
  if (!wrapper) return false

  if (enabled) wrapper.style.removeProperty('display')
  else wrapper.style.setProperty('display', 'none', 'important')

  const access = wrapper.shadowRoot?.getElementById('vlibras-access') as HTMLElement | null
  const button = wrapper.shadowRoot?.getElementById('vlibras-button') as HTMLElement | null
  if (!access) return true

  const left = corner.endsWith('left')
  const top = corner.startsWith('top')
  access.style.setProperty('top', top ? '64px' : 'auto', 'important')
  access.style.setProperty('bottom', top ? 'auto' : '10px', 'important')
  access.style.setProperty('left', left ? '10px' : 'auto', 'important')
  access.style.setProperty('right', left ? 'auto' : '10px', 'important')
  access.style.setProperty('flex-direction', left ? 'row-reverse' : 'row', 'important')
  button?.style.setProperty('left', left ? '0' : 'auto', 'important')
  button?.style.setProperty('right', left ? 'auto' : '0', 'important')
  return true
}

export default function VLibrasController() {
  const { prefs, loading } = usePreferences()

  useEffect(() => {
    if (loading) return

    let timer: ReturnType<typeof setInterval> | undefined

    const waitAndApply = () => {
      if (applyPreferences(prefs.vlibras.enabled, prefs.vlibras.corner)) {
        if (timer) clearInterval(timer)
        timer = undefined
      }
    }

    // Se já foi carregado nesta navegação, apenas aplica visibilidade/posição.
    if (document.getElementById(WRAPPER_ID)) {
      waitAndApply()
      return
    }

    // Desligado desde o início: não baixa o plugin nem mostra a mão por um frame.
    if (!prefs.vlibras.enabled) return

    const initialize = () => {
      if (!document.getElementById(WRAPPER_ID) && window.VLibras?.Widget) {
        const horizontal = prefs.vlibras.corner.endsWith('left') ? 'L' : 'R'
        new window.VLibras.Widget({ rootPath: ROOT_URL, position: horizontal })
      }
      waitAndApply()
      if (!document.getElementById(WRAPPER_ID)) timer = setInterval(waitAndApply, 100)
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (window.VLibras?.Widget) initialize()
    else if (existingScript) existingScript.addEventListener('load', initialize, { once: true })
    else {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = `${ROOT_URL}/vlibras-plugin.js`
      script.async = true
      script.addEventListener('load', initialize, { once: true })
      document.body.appendChild(script)
    }

    return () => {
      if (timer) clearInterval(timer)
      existingScript?.removeEventListener('load', initialize)
    }
  }, [loading, prefs.vlibras.enabled, prefs.vlibras.corner])

  return null
}
