import { useEffect, useState } from 'react'
import { ThemeProviderContext, type Theme } from '@/lib/theme-context'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  theme?: Theme
  controlled?: boolean
  onThemeChange?: (theme: Theme) => void
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  theme: authoritativeTheme,
  controlled = false,
  onThemeChange,
  ...props
}: ThemeProviderProps) {
  const [localTheme, setLocalTheme] = useState<Theme>(() => {
    try {
      const cached = localStorage.getItem(storageKey)
      return cached === 'dark' || cached === 'light' || cached === 'system'
        ? cached
        : defaultTheme
    } catch {
      return defaultTheme
    }
  })
  const theme = controlled ? (authoritativeTheme ?? localTheme) : localTheme
  useEffect(() => {
    if (controlled && authoritativeTheme) {
      try {
        localStorage.setItem(storageKey, authoritativeTheme)
      } catch {
        /* Cache is optional. */
      }
    }
  }, [controlled, authoritativeTheme, storageKey])

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = (isDark: boolean) => {
      root.classList.remove('light', 'dark')
      root.classList.add(isDark ? 'dark' : 'light')
    }

    if (theme === 'system') {
      applyTheme(mediaQuery.matches)

      const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches)
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    applyTheme(theme === 'dark')
  }, [theme])

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      if (controlled) {
        onThemeChange?.(newTheme)
        return
      }
      try {
        localStorage.setItem(storageKey, newTheme)
      } catch {
        /* Cache is optional. */
      }
      setLocalTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
