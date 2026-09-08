import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeLanguage, startLanguagePreferences } from './language-init'
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  listen: vi.fn(),
  change: vi.fn(),
  locale: vi.fn(),
}))
vi.mock('@/features/preferences', () => ({
  loadPreferences: mocks.load,
  PREFERENCES_CHANGED_EVENT: 'preferences-changed',
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('@tauri-apps/plugin-os', () => ({ locale: mocks.locale }))
vi.mock('./config', () => ({ default: { changeLanguage: mocks.change } }))
let cleanup: (() => void) | undefined
beforeEach(() => {
  vi.resetAllMocks()
  mocks.change.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.restoreAllMocks()
})
describe('language preference synchronization', () => {
  it('ignores a slow system locale after a newer explicit preference', async () => {
    let resolve!: (locale: string) => void
    mocks.locale.mockReturnValue(
      new Promise(done => {
        resolve = done
      })
    )
    const slow = initializeLanguage('system')
    await initializeLanguage('zh-CN')
    resolve('en-US')
    await slow
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith('zh-CN')
  })
  it('releases delayed subscriptions on unmount without loading', async () => {
    const stop = vi.fn()
    let resolve!: (value: () => void) => void
    mocks.listen.mockReturnValue(
      new Promise(done => {
        resolve = done
      })
    )
    cleanup = startLanguagePreferences()
    await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce())
    cleanup()
    cleanup = undefined
    resolve(stop)
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('preserves current language when disk loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.listen.mockResolvedValue(vi.fn())
    mocks.load.mockRejectedValue(new Error('corrupted preferences'))
    cleanup = startLanguagePreferences()
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce())
    expect(mocks.change).not.toHaveBeenCalled()
  })
})
