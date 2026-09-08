import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  loadPreferences,
  patchPreferences,
  PREFERENCES_CHANGED_EVENT,
  type PreferencesPatch,
  type PreferencesSnapshot,
} from '@/features/preferences'

export const preferencesQueryKeys = {
  all: ['preferences'] as const,
  preferences: () => ['preferences'] as const,
}

export function usePreferences() {
  return useQuery({
    queryKey: preferencesQueryKeys.preferences(),
    queryFn: loadPreferences,
    retry: false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })
}

/** Mount once under QueryClientProvider, independently of the settings dialog. */
export function PreferencesRuntime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    let disposed = false
    let reload = Promise.resolve()
    let unlisten: (() => void) | undefined
    Promise.resolve()
      .then(() =>
        listen(PREFERENCES_CHANGED_EVENT, () => {
          if (disposed) return
          reload = reload
            .then(async () => {
              if (disposed) return
              await queryClient.cancelQueries({
                queryKey: preferencesQueryKeys.preferences(),
              })
              if (disposed) return
              await queryClient.refetchQueries(
                { queryKey: preferencesQueryKeys.preferences(), type: 'all' },
                { throwOnError: true }
              )
            })
            .catch(error => {
              if (!disposed) console.error('Preferences reload failed:', error)
            })
        })
      )
      .then(stop => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch(error => {
        if (!disposed) console.error('Preferences subscription failed:', error)
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [queryClient])
  return null
}

export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: 'preferences-patch' },
    mutationFn: async (patch: PreferencesPatch) => {
      const state = queryClient.getQueryState<PreferencesSnapshot>(
        preferencesQueryKeys.preferences()
      )
      if (state?.status !== 'success' || !state.data)
        throw new Error('Preferences must load successfully before saving')
      return patchPreferences(patch)
    },
    onSuccess: async snapshot => {
      await queryClient.cancelQueries({
        queryKey: preferencesQueryKeys.preferences(),
      })
      queryClient.setQueryData(preferencesQueryKeys.preferences(), snapshot)
      toast.success('Preferences saved')
      // A concurrent native writer may have committed after this response.
      void queryClient.invalidateQueries({
        queryKey: preferencesQueryKeys.preferences(),
      })
    },
    onError: error => {
      toast.error(error instanceof Error ? error.message : String(error))
    },
  })
}
