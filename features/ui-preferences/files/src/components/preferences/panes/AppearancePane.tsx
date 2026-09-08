import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import type {
  LanguagePreference,
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
  const { t } = useTranslation()
  const { data: preferences, isSuccess, error } = usePreferences()
  const savePreferences = useSavePreferences()
  const disabled = !isSuccess || !preferences || savePreferences.isPending
  const handleThemeChange = (theme: ThemePreference) =>
    savePreferences.mutate({ theme })
  const handleLanguageChange = (value: string) =>
    savePreferences.mutate({ language: value as LanguagePreference })

  // Determine the current language value for the select
  const currentLanguageValue = preferences?.language ?? 'system'

  return (
    <div className="space-y-6">
      {error && <p role="alert">{error.message}</p>}
      <SettingsSection title={t('preferences.appearance.language')}>
        <SettingsField
          label={t('preferences.appearance.language')}
          description={t('preferences.appearance.languageDescription')}
        >
          <Select
            value={currentLanguageValue}
            onValueChange={handleLanguageChange}
            disabled={disabled}
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
            value={preferences?.theme ?? 'system'}
            onValueChange={value => handleThemeChange(value as ThemePreference)}
            disabled={disabled}
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
