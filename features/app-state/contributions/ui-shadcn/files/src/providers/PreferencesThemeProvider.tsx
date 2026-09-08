import type { ReactNode } from 'react'
import { ThemeProvider } from '@/components/ThemeProvider'
import { usePreferences, useSavePreferences } from '@/services/preferences'

export function PreferencesThemeProvider({
  children,
}: {
  children: ReactNode
}) {
  const { data } = usePreferences()
  const save = useSavePreferences()
  return (
    <ThemeProvider
      controlled
      theme={data?.theme}
      onThemeChange={theme => save.mutate({ theme })}
    >
      {children}
    </ThemeProvider>
  )
}
