import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPreferences, savePreferences } from './index'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('preferences feature', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('loads preferences through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce({
      theme: 'system',
      language: 'system',
      quick_pane_shortcut: null,
    })

    const preferences = await loadPreferences()

    expect(invokeMock).toHaveBeenCalledWith('load_preferences')
    expect(preferences).toEqual({
      theme: 'system',
      language: 'system',
      quick_pane_shortcut: null,
    })
  })

  it('saves preferences through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce({
      theme: 'dark',
      language: 'zh-CN',
      quick_pane_shortcut: 'CommandOrControl+Alt+Space',
    })

    const preferences = await savePreferences({
      theme: 'dark',
      language: 'zh-CN',
      quick_pane_shortcut: 'CommandOrControl+Alt+Space',
    })

    expect(invokeMock).toHaveBeenCalledWith('save_preferences', {
      preferences: {
        theme: 'dark',
        language: 'zh-CN',
        quick_pane_shortcut: 'CommandOrControl+Alt+Space',
      },
    })
    expect(preferences).toEqual({
      theme: 'dark',
      language: 'zh-CN',
      quick_pane_shortcut: 'CommandOrControl+Alt+Space',
    })
  })
})
