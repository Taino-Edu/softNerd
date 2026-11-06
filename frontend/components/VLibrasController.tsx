'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
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
 * Páginas em que o Libras fica no MENU, sem a mão flutuante (pedido do Taino, 04/11): o plugin
 * carrega sempre (acessibilidade não depende da preferência do botão) e o item do menu abre o
 * painel com abrirVLibras(). Página nova entra aqui quando o menu dela ganhar o item "Libras".
 */
// As páginas com o menu da loja (components/loja/MenuLoja): principal, Produtos, produto e Sacola.
const LIBRAS_NO_MENU = ['/', '/produtos', '/cliente/reserva/carrinho']

function temLibrasNoMenu(caminho: string) {
  return LIBRAS_NO_MENU.includes(caminho) || caminho.startsWith('/produtos/')
}

// Telas de entrar/cadastrar: no canto direito a mão ficava em cima do "Mostrar" da senha (teste do
// fluxo no celular, 06/11). Lá ela vai pro canto esquerdo, onde os campos só têm o ícone decorativo.
const TELAS_DE_ENTRADA = ['/entrar', '/cadastro', '/login', '/primeiro-acesso', '/reset-password']
const cantoDaTela = (caminho: string, corner: string) =>
  TELAS_DE_ENTRADA.includes(caminho) && corner.endsWith('right') ? corner.replace('right', 'left') : corner

/**
 * Abre o painel do VLibras. O botão mora dentro do Shadow DOM do plugin — o seletor antigo
 * `[vw-access-button]` não existe mais e o "Libras" do menu não abria nada.
 */
export function abrirVLibras() {
  const sombra = document.getElementById(WRAPPER_ID)?.shadowRoot
  ;(sombra?.getElementById('vlibras-button') as HTMLElement | null)?.click()
}

/**
 * O plugin atual cria #vlibras-access-wrapper com Shadow DOM. O seletor antigo
 * `[vw]` não controla mais o botão, por isso ele continuava visível mesmo com a
 * preferência desligada.
 * flutuante: mostra a mão no canto; carregado: o plugin fica disponível (pro menu) mesmo sem ela.
 */
function applyPreferences(flutuante: boolean, carregado: boolean, corner: string) {
  const wrapper = document.getElementById(WRAPPER_ID) as HTMLElement | null
  if (!wrapper) return false

  if (carregado) wrapper.style.removeProperty('display')
  else wrapper.style.setProperty('display', 'none', 'important')

  const access = wrapper.shadowRoot?.getElementById('vlibras-access') as HTMLElement | null
  const button = wrapper.shadowRoot?.getElementById('vlibras-button') as HTMLElement | null
  if (!access) return true

  if (flutuante) access.style.removeProperty('display')
  else access.style.setProperty('display', 'none', 'important')

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
  const caminho = usePathname() ?? ''
  const noMenu = temLibrasNoMenu(caminho)
  const canto = cantoDaTela(caminho, prefs.vlibras.corner)
  const carregado = prefs.vlibras.enabled || noMenu
  const flutuante = prefs.vlibras.enabled && !noMenu

  useEffect(() => {
    if (loading) return

    let timer: ReturnType<typeof setInterval> | undefined

    const waitAndApply = () => {
      if (applyPreferences(flutuante, carregado, canto)) {
        if (timer) clearInterval(timer)
        timer = undefined
      }
    }

    // Se já foi carregado nesta navegação, apenas aplica visibilidade/posição.
    if (document.getElementById(WRAPPER_ID)) {
      waitAndApply()
      return
    }

    // Desligado desde o início (e sem Libras no menu): não baixa o plugin nem mostra a mão por um frame.
    if (!carregado) return

    const initialize = () => {
      if (!document.getElementById(WRAPPER_ID) && window.VLibras?.Widget) {
        const horizontal = canto.endsWith('left') ? 'L' : 'R'
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
  }, [loading, carregado, flutuante, canto])

  return null
}
