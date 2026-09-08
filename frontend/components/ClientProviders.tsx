'use client'

import { useEffect } from 'react'
import { PreferencesProvider } from '@/contexts/PreferencesContext'
import { iniciarKeepAlive } from '@/lib/sessionKeepAlive'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  // Renovação de sessão pro sistema inteiro — antes só o painel admin renovava,
  // e o cliente era deslogado no meio da comanda.
  useEffect(() => iniciarKeepAlive(), [])

  return (
    <PreferencesProvider>{children}</PreferencesProvider>
  )
}
