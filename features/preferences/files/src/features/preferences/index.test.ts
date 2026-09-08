import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPreferences, patchPreferences } from './index'
const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
beforeEach(() => invokeMock.mockReset())
describe('preferences command adapter', () => {
  it('loads backend snapshots', async () => {
    const snapshot = {
      theme: 'dark',
      language: 'system',
      quick_pane_shortcut: null,
    }
    invokeMock.mockResolvedValueOnce(snapshot)
    await expect(loadPreferences()).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('load_preferences')
  })
  it('sends only changed fields and returns the backend snapshot', async () => {
    const snapshot = {
      theme: 'dark',
      language: 'zh-CN',
      quick_pane_shortcut: 'Alt+X',
    }
    invokeMock.mockResolvedValueOnce(snapshot)
    await expect(patchPreferences({ theme: 'dark' })).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('patch_preferences', {
      patch: { theme: 'dark' },
    })
  })
  it('rejects backend errors instead of returning default data', async () => {
    invokeMock.mockRejectedValueOnce('corrupted file')
    await expect(loadPreferences()).rejects.toThrow('corrupted file')
  })
})
