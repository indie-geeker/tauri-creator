import { describe, expect, it } from 'vitest'
import { preferenceNavigationItems } from './PreferencesDialog'
import { formatShortcutForDisplay, keyEventToShortcut } from './ShortcutPicker'
import { settingsLanguageOptions } from './panes/AppearancePane'

describe('PreferencesDialog configuration', () => {
  it('keeps the generic settings dialog scoped to appearance settings by default', () => {
    expect(preferenceNavigationItems.map(item => item.id)).toEqual([
      'appearance',
    ])
  })

  it('offers system, English, and Simplified Chinese language choices', () => {
    expect(settingsLanguageOptions).toEqual([
      { value: 'system', labelKey: 'preferences.appearance.language.system' },
      { value: 'en', label: 'English' },
      { value: 'zh-CN', label: '简体中文' },
    ])
  })

  it('formats quick-pane shortcuts for macOS and other platforms', () => {
    expect(formatShortcutForDisplay('CommandOrControl+Shift+.', 'macos')).toBe(
      '⌘⇧.'
    )
    expect(formatShortcutForDisplay('CommandOrControl+Shift+.', 'other')).toBe(
      'Ctrl+Shift+.'
    )
  })

  it('captures Tauri-compatible global shortcuts from keyboard events', () => {
    expect(
      keyEventToShortcut({
        key: 'k',
        code: 'KeyK',
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      })
    ).toBe('CommandOrControl+Shift+K')

    expect(
      keyEventToShortcut({
        key: 'Shift',
        code: 'ShiftLeft',
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      })
    ).toBeNull()
  })
})
