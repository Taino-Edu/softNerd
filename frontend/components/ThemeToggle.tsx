'use client'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { setOptionalItem } from '@/lib/cookieConsent'

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [light, setLight] = useState(false)

  useEffect(() => {
    // Lê preferência salva ou usa escuro por padrão
    const saved = localStorage.getItem('theme')
    const isLight = saved === 'light'
    setLight(isLight)
    document.documentElement.classList.toggle('light', isLight)
  }, [])

  function toggle() {
    const next = !light
    setLight(next)
    document.documentElement.classList.toggle('light', next)
    // Preferencia cosmetica: so persiste se o visitante liberou a categoria.
    setOptionalItem('theme', next ? 'light' : 'dark')
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        title={light ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--border-color)]"
      >
        {light
          ? <Moon className="w-4 h-4 text-brand-400" />
          : <Sun  className="w-4 h-4 text-brand-400" />
        }
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 px-3 py-2 rounded-lg w-full transition-colors hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
    >
      {light
        ? <Moon className="w-4 h-4 text-brand-400" />
        : <Sun  className="w-4 h-4 text-brand-400" />
      }
      <span className="text-sm">{light ? 'Tema Escuro' : 'Tema Claro'}</span>
    </button>
  )
}
