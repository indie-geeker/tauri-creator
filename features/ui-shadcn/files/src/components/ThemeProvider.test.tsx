// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { useTheme } from '@/hooks/use-theme'
afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})
function Consumer() {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme('dark')}>{theme}</button>
}
describe('ThemeProvider authority', () => {
  it('controlled changes remain pending until the backend prop changes', () => {
    localStorage.setItem('ui-theme', 'dark')
    const onThemeChange = vi.fn()
    const view = render(
      <ThemeProvider controlled theme="light" onThemeChange={onThemeChange}>
        <Consumer />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(onThemeChange).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('button', { name: 'light' })).toBeTruthy()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    view.rerender(
      <ThemeProvider controlled theme="dark" onThemeChange={onThemeChange}>
        <Consumer />
      </ThemeProvider>
    )
    expect(screen.getByRole('button', { name: 'dark' })).toBeTruthy()
  })
  it('standalone mode preserves local preferences', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(screen.getByRole('button', { name: 'dark' })).toBeTruthy()
    expect(localStorage.getItem('ui-theme')).toBe('dark')
  })
})
