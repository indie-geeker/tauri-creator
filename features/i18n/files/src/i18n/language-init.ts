/**
 * Language initialization utilities for detecting and applying the user's
 * preferred language at app startup.
 */
import { locale } from '@tauri-apps/plugin-os'
import i18n from './config'

export type ResolvedLanguage = 'en' | 'zh-CN'

export function resolveLanguagePreference(
  savedLanguage: string | null | undefined,
  systemLocale: string | null | undefined
): ResolvedLanguage {
  if (savedLanguage === 'en' || savedLanguage === 'zh-CN') {
    return savedLanguage
  }

  if (savedLanguage && savedLanguage !== 'system') {
    return 'en'
  }

  const normalizedLocale = systemLocale?.toLowerCase() ?? ''

  if (normalizedLocale.startsWith('zh')) {
    return 'zh-CN'
  }

  if (normalizedLocale.startsWith('en')) {
    return 'en'
  }

  return 'en'
}

/**
 * Initialize the application language.
 *
 * Priority:
 * 1. User's saved language preference (if set)
 * 2. System locale (if we have translations for it)
 * 3. English (fallback)
 *
 * @param savedLanguage - The user's saved language preference from preferences
 */
export async function initializeLanguage(
  savedLanguage: string | null
): Promise<void> {
  try {
    if (savedLanguage && savedLanguage !== 'system') {
      const language = resolveLanguagePreference(savedLanguage, null)
      await i18n.changeLanguage(language)
      console.info('Language set from user preference', { language })
      return
    }

    const systemLocale = await locale()
    console.debug('Detected system locale', { systemLocale })
    const language = resolveLanguagePreference(savedLanguage, systemLocale)
    await i18n.changeLanguage(language)
    console.info('Language set from system locale', { systemLocale, language })
  } catch (error) {
    console.error('Failed to initialize language', { error })
    // Ensure we have some language set
    await i18n.changeLanguage('en')
  }
}
