import { useTranslation } from 'react-i18next'
import { locale } from '@tauri-apps/plugin-os'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/hooks/use-theme'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { resolveLanguagePreference } from '@/i18n'
import type {
  LanguagePreference,
  PreferencesSnapshot,
  ThemePreference,
} from '@/features/preferences'

export const settingsLanguageOptions: Array<
  | { value: 'system'; labelKey: string; label?: never }
  | {
      value: Exclude<LanguagePreference, 'system'>
      label: string
      labelKey?: never
    }
> = [
  { value: 'system', labelKey: 'preferences.appearance.language.system' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
]

export function AppearancePane() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  const handleThemeChange = (value: ThemePreference) => {
    // Update the theme provider immediately for instant UI feedback
    setTheme(value)

    // Persist the theme preference to disk, preserving other preferences
    if (preferences) {
      savePreferences.mutate({ ...preferences, theme: value })
    }
  }

  const handleLanguageChange = async (value: string) => {
    const language = value as PreferencesSnapshot['language']

    try {
      const systemLocale = language === 'system' ? await locale() : null
      const resolvedLanguage = resolveLanguagePreference(language, systemLocale)
      console.debug('Changing language', {
        newLang: resolvedLanguage,
        oldLang: i18n.language,
      })
      await i18n.changeLanguage(resolvedLanguage)
      toast.success(t('toast.success.preferencesSaved'))
    } catch (error) {
      console.error('Failed to change language', { error })
      toast.error(t('toast.error.generic'))
      return
    }

    // Persist the language preference to disk
    if (preferences) {
      savePreferences.mutate({ ...preferences, language })
    }
  }

  // Determine the current language value for the select
  const currentLanguageValue = preferences?.language ?? 'system'

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.appearance.language')}>
        <SettingsField
          label={t('preferences.appearance.language')}
          description={t('preferences.appearance.languageDescription')}
        >
          <Select
            value={currentLanguageValue}
            onValueChange={handleLanguageChange}
            disabled={savePreferences.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                {t('preferences.appearance.language.system')}
              </SelectItem>
              {settingsLanguageOptions
                .filter(option => option.value !== 'system')
                .map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.appearance.theme')}>
        <SettingsField
          label={t('preferences.appearance.colorTheme')}
          description={t('preferences.appearance.colorThemeDescription')}
        >
          <Select
            value={theme}
            onValueChange={value => handleThemeChange(value as ThemePreference)}
            disabled={savePreferences.isPending}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('preferences.appearance.selectTheme')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                {t('preferences.appearance.theme.light')}
              </SelectItem>
              <SelectItem value="dark">
                {t('preferences.appearance.theme.dark')}
              </SelectItem>
              <SelectItem value="system">
                {t('preferences.appearance.theme.system')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
