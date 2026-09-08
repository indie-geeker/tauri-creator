import { isTauri } from '@tauri-apps/api/core'
import { platform } from '@/lib/os-runtime'

export type AppPlatform = 'macos' | 'windows' | 'linux'

/** Browser previews use the native-decoration layout unless explicitly forced. */
export function usePlatform(): AppPlatform {
  if (!isTauri()) return 'linux'
  const current = platform()
  return current === 'macos' || current === 'windows' ? current : 'linux'
}
