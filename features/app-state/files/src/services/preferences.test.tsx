// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  preferencesQueryKeys,
  usePreferences,
  useSavePreferences,
  PreferencesRuntime,
} from './preferences'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  patch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  listen: vi.fn(),
}))
vi.mock('@/features/preferences', () => ({
  loadPreferences: mocks.load,
  patchPreferences: mocks.patch,
  PREFERENCES_CHANGED_EVENT: 'preferences-changed',
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.listen.mockResolvedValue(vi.fn())
})
function context() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
const snapshot = {
  theme: 'dark',
  language: 'en',
  quick_pane_shortcut: 'Alt+X',
}
describe('preferences authority', () => {
  it('keeps load failure as an error without fabricated defaults', async () => {
    mocks.load.mockRejectedValue(new Error('corrupted'))
    const { wrapper, client } = context()
    const { result } = renderHook(usePreferences, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(
      client.getQueryData(preferencesQueryKeys.preferences())
    ).toBeUndefined()
  })
  it('refuses writes until a snapshot has loaded successfully', async () => {
    const { wrapper } = context()
    const { result } = renderHook(useSavePreferences, { wrapper })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ theme: 'dark' })
      ).rejects.toThrow('load successfully')
    })
    expect(mocks.patch).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('keeps authoritative cache and theme unchanged when persistence fails', async () => {
    const { wrapper, client } = context()
    client.setQueryData(preferencesQueryKeys.preferences(), snapshot)
    mocks.patch.mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(useSavePreferences, { wrapper })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ theme: 'light' })
      ).rejects.toThrow('disk full')
    })
    expect(client.getQueryData(preferencesQueryKeys.preferences())).toEqual(
      snapshot
    )
    expect(mocks.error).toHaveBeenCalledOnce()
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('uses the returned snapshot and emits one success message', async () => {
    const { wrapper, client } = context()
    client.setQueryData(preferencesQueryKeys.preferences(), snapshot)
    const saved = { ...snapshot, theme: 'light', language: 'zh-CN' }
    mocks.patch.mockResolvedValue(saved)
    const { result } = renderHook(useSavePreferences, { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ theme: 'light' })
    })
    expect(mocks.patch).toHaveBeenCalledWith({ theme: 'light' })
    expect(client.getQueryData(preferencesQueryKeys.preferences())).toEqual(
      saved
    )
    expect(mocks.success).toHaveBeenCalledOnce()
  })
  it('cancels an initial stale load before accepting an event refresh', async () => {
    const { wrapper, client } = context()
    let callback!: () => void
    let resolveInitial!: (value: typeof snapshot) => void
    let resolveEvent!: (value: typeof snapshot) => void
    mocks.listen.mockImplementation((_event, next) => {
      callback = next
      return Promise.resolve(vi.fn())
    })
    mocks.load
      .mockReturnValueOnce(
        new Promise(done => {
          resolveInitial = done
        })
      )
      .mockReturnValueOnce(
        new Promise(done => {
          resolveEvent = done
        })
      )
    const { result } = renderHook(
      () => {
        PreferencesRuntime()
        return usePreferences()
      },
      { wrapper }
    )
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce())
    act(() => callback())
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
    await act(async () => {
      resolveInitial(snapshot)
    })
    expect(
      client.getQueryData(preferencesQueryKeys.preferences())
    ).toBeUndefined()
    const latest = { ...snapshot, theme: 'light' }
    await act(async () => {
      resolveEvent(latest)
    })
    await waitFor(() => expect(result.current.data).toEqual(latest))
  })
  it('keeps event reload failure in Query error state and blocks subsequent writes', async () => {
    const { wrapper, client } = context()
    let callback!: () => void
    mocks.listen.mockImplementation((_event, next) => {
      callback = next
      return Promise.resolve(vi.fn())
    })
    mocks.load
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('reload corrupted'))
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(
        () => {
          PreferencesRuntime()
          return { query: usePreferences(), save: useSavePreferences() }
        },
        { wrapper }
      )
      await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
      await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce())
      act(() => callback())
      await waitFor(() => expect(result.current.query.isError).toBe(true))
      expect(client.getQueryData(preferencesQueryKeys.preferences())).toEqual(
        snapshot
      )
      await act(async () => {
        await expect(
          result.current.save.mutateAsync({ theme: 'light' })
        ).rejects.toThrow('load successfully')
      })
      expect(mocks.patch).not.toHaveBeenCalled()
      expect(mocks.success).not.toHaveBeenCalled()
      expect(mocks.error).toHaveBeenCalledOnce()
    } finally {
      report.mockRestore()
    }
  })
  it('releases a listener installed after unmount without starting event reloads', async () => {
    const { wrapper } = context()
    const stop = vi.fn()
    let callback!: () => void
    let resolve!: (dispose: () => void) => void
    mocks.listen.mockImplementation((_event, next) => {
      callback = next
      return new Promise(done => {
        resolve = done
      })
    })
    const { unmount } = renderHook(PreferencesRuntime, { wrapper })
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce())
    unmount()
    await act(async () => {
      resolve(stop)
      callback()
    })
    expect(mocks.load).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
  })
})
