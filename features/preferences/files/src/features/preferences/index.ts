import { invoke } from '@tauri-apps/api/core'

export const PREFERENCES_FEATURE_ID = 'preferences'

export type ThemePreference = 'system' | 'light' | 'dark'
export type LanguagePreference = 'system' | 'en' | 'zh-CN'

export type PreferencesSnapshot = {
  theme: ThemePreference
  language: LanguagePreference
  quick_pane_shortcut: string | null
}

// The Rust command stores preferences in the app data directory.
export function loadPreferences(): Promise<PreferencesSnapshot> {
  return invoke<PreferencesSnapshot>('load_preferences')
}

export function savePreferences(
  preferences: PreferencesSnapshot
): Promise<PreferencesSnapshot> {
  return invoke<PreferencesSnapshot>('save_preferences', { preferences })
}
