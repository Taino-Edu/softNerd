'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { userApi, UserPreferences, DEFAULT_PREFERENCES, DEFAULT_DASHBOARD_PANELS } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'

const LOCAL_KEY = 'user-preferences'

function mergeWithDefaults(partial: Partial<UserPreferences>): UserPreferences {
  const dash: Partial<UserPreferences['dashboard']> = partial.dashboard ?? {}
  return {
    aiButton:      { ...DEFAULT_PREFERENCES.aiButton,      ...(partial.aiButton      ?? {}) },
    vlibras:       { ...DEFAULT_PREFERENCES.vlibras,       ...(partial.vlibras       ?? {}) },
    timer:         { ...DEFAULT_PREFERENCES.timer,         ...(partial.timer         ?? {}) },
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(partial.notifications ?? {}) },
    pdv:           { ...DEFAULT_PREFERENCES.pdv,           ...(partial.pdv           ?? {}) },
    dashboard:     {
      ...DEFAULT_PREFERENCES.dashboard,
      ...dash,
      panels: { ...DEFAULT_DASHBOARD_PANELS, ...(dash.panels ?? {}) },
    },
  }
}

interface PreferencesContextValue {
  prefs:   UserPreferences
  loading: boolean
  saving:  boolean
  update:  (patch: Partial<UserPreferences>) => void
  save:    (next: UserPreferences) => Promise<void>
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs,   setPrefs]   = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    const cached = localStorage.getItem(LOCAL_KEY)
    if (cached) {
      try { setPrefs(mergeWithDefaults(JSON.parse(cached))) } catch {}
    }

    if (!isLoggedIn()) {
      setLoading(false)
      return
    }

    userApi.getPreferences()
      .then(({ data }: { data: UserPreferences }) => {
        const merged = mergeWithDefaults(data)
        setPrefs(merged)
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = useCallback(async (next: UserPreferences) => {
    setPrefs(next)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
    setSaving(true)
    try {
      await userApi.updatePreferences(next)
    } catch {}
    finally { setSaving(false) }
  }, [])

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs(current => {
      const next = mergeWithDefaults({ ...current, ...patch })
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      setSaving(true)
      userApi.updatePreferences(next)
        .catch(() => {})
        .finally(() => setSaving(false))
      return next
    })
  }, [])

  return (
    <PreferencesContext.Provider value={{ prefs, loading, saving, update, save }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferencesContext() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferencesContext must be used inside PreferencesProvider')
  return ctx
}
