import { useEffect, useRef, useState, type ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ThemeProvider } from '@/components/ThemeProvider'
import {
  loadPreferences,
  patchPreferences,
  PREFERENCES_CHANGED_EVENT,
  type PreferencesSnapshot,
  type ThemePreference,
} from '@/features/preferences'
import { disposeAsyncSubscription } from '@/lib/async-subscription'

/** Rust-authoritative bridge for the preferences + UI combination without Query. */
export function PreferencesThemeProvider({
  children,
}: {
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<PreferencesSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const mounted = useRef(false)
  const version = useRef(0)
  useEffect(() => {
    mounted.current = true
    const reload = async () => {
      const request = ++version.current
      try {
        const value = await loadPreferences()
        if (mounted.current && version.current === request) {
          setSnapshot(value)
          setError(null)
        }
      } catch (reason) {
        if (mounted.current && version.current === request)
          setError(String(reason))
      }
    }
    const stop = disposeAsyncSubscription(
      async () => {
        const unlisten = await listen(PREFERENCES_CHANGED_EVENT, () => {
          void reload()
        })
        if (mounted.current) void reload()
        return unlisten
      },
      reason => setError(String(reason))
    )
    return () => {
      mounted.current = false
      version.current += 1
      stop()
    }
  }, [])
  const change = async (theme: ThemePreference) => {
    if (!snapshot || error || pending) return
    setPending(true)
    const request = ++version.current
    try {
      const value = await patchPreferences({ theme })
      if (mounted.current && version.current === request) setSnapshot(value)
    } catch (reason) {
      if (mounted.current) setError(String(reason))
    } finally {
      if (mounted.current) setPending(false)
    }
  }
  return (
    <ThemeProvider
      controlled
      theme={snapshot?.theme}
      onThemeChange={theme => {
        void change(theme)
      }}
    >
      {error && <p role="alert">Preferences unavailable: {error}</p>}
      {children}
    </ThemeProvider>
  )
}
