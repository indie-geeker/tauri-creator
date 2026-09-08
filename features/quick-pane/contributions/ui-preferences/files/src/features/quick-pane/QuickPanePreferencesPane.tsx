import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DEFAULT_QUICK_PANE_SHORTCUT,
  getDefaultQuickPaneShortcut,
  updateQuickPaneShortcut,
} from '@/features/quick-pane'
import { usePreferences } from '@/services/preferences'
import { ShortcutPicker } from '@/components/preferences/ShortcutPicker'
import {
  SettingsField,
  SettingsSection,
} from '@/components/preferences/shared/SettingsComponents'

export function QuickPanePreferencesPane() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: defaultShortcut = DEFAULT_QUICK_PANE_SHORTCUT } = useQuery({
    queryKey: ['default-quick-pane-shortcut'],
    queryFn: getDefaultQuickPaneShortcut,
    staleTime: Infinity,
  })

  const handleShortcutChange = async (newShortcut: string | null) => {
    if (!preferences) return

    setPending(true)
    try {
      const registration = await updateQuickPaneShortcut(newShortcut)
      if (registration.shortcutError) {
        const detail = `${registration.shortcutError}; active: ${registration.activeShortcut ?? 'none'}${registration.shortcutDegraded ? '; degraded' : ''}`
        setStatus(detail)
        toast.error(t('toast.error.shortcutFailed'), { description: detail })
        return
      }
      setStatus(null)
      await queryClient.invalidateQueries({ queryKey: ['preferences'] })
      toast.success(t('toast.success.preferencesSaved'))
    } catch (error) {
      setStatus(String(error))
      toast.error(String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {status && <p role="alert">{status}</p>}
      <SettingsSection title={t('preferences.general.keyboardShortcuts')}>
        <SettingsField
          label={t('preferences.general.quickPaneShortcut')}
          description={t('preferences.general.quickPaneShortcutDescription')}
        >
          <ShortcutPicker
            value={preferences?.quick_pane_shortcut ?? null}
            defaultValue={defaultShortcut}
            onChange={handleShortcutChange}
            disabled={!preferences || pending}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
