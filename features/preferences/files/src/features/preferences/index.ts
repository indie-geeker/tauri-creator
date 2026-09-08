import { commands } from '@/lib/tauri-bindings'
import { unwrapCommandResult } from '@/lib/command-result'
import type {
  PreferencesPatch,
  PreferencesSnapshot,
} from '@/lib/tauri-bindings'
export type {
  PreferencesSnapshot,
  PreferencesPatch,
  ThemePreference,
  LanguagePreference,
} from '@/lib/tauri-bindings'

export const PREFERENCES_FEATURE_ID = 'preferences'
export const PREFERENCES_CHANGED_EVENT = 'preferences-changed'

export function loadPreferences(): Promise<PreferencesSnapshot> {
  return unwrapCommandResult(commands.loadPreferences())
}

export function patchPreferences(
  patch: PreferencesPatch
): Promise<PreferencesSnapshot> {
  return unwrapCommandResult(commands.patchPreferences(patch))
}
