import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DEFAULT_QUICK_PANE_SHORTCUT,
  getDefaultQuickPaneShortcut,
  updateQuickPaneShortcut,
} from '@/features/quick-pane'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { ShortcutPicker } from '../ShortcutPicker'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'

export function GeneralPane() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  const { data: defaultShortcut = DEFAULT_QUICK_PANE_SHORTCUT } = useQuery({
    queryKey: ['default-quick-pane-shortcut'],
    queryFn: getDefaultQuickPaneShortcut,
    staleTime: Infinity,
  })

  const handleShortcutChange = async (newShortcut: string | null) => {
    if (!preferences) return

    const oldShortcut = preferences.quick_pane_shortcut
    const registration = await updateQuickPaneShortcut(newShortcut)

    if (registration.shortcutError) {
      toast.error(t('toast.error.shortcutFailed'), {
        description: registration.shortcutError,
      })
      return
    }

    try {
      await savePreferences.mutateAsync({
        ...preferences,
        quick_pane_shortcut: newShortcut,
      })
    } catch {
      const rollback = await updateQuickPaneShortcut(oldShortcut)

      if (rollback.shortcutError) {
        toast.error(t('toast.error.shortcutRestoreFailed'), {
          description: t('toast.error.shortcutRestoreDescription'),
        })
      }
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.general.keyboardShortcuts')}>
        <SettingsField
          label={t('preferences.general.quickPaneShortcut')}
          description={t('preferences.general.quickPaneShortcutDescription')}
        >
          <ShortcutPicker
            value={preferences?.quick_pane_shortcut ?? null}
            defaultValue={defaultShortcut}
            onChange={handleShortcutChange}
            disabled={!preferences || savePreferences.isPending}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
