import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DiagnosticsSnapshot,
  collectDiagnostics,
  exportDiagnostics,
} from './index'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('diagnostics feature', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('collects a diagnostics snapshot through the Tauri command', async () => {
    const expected: DiagnosticsSnapshot = {
      appName: 'diagnostics-demo',
      appVersion: '0.1.0',
      platform: 'macos',
      arch: 'aarch64',
      appDataDir: '/tmp/diagnostics-demo',
      logDir: '/tmp/diagnostics-demo/logs',
      status: 'ok',
      checks: [
        {
          name: 'diagnostics-feature',
          status: 'ok',
          detail: 'Diagnostics feature is enabled.',
        },
      ],
    }
    invokeMock.mockResolvedValueOnce(expected)

    const snapshot = await collectDiagnostics()

    expect(invokeMock).toHaveBeenCalledWith('collect_diagnostics')
    expect(snapshot).toEqual(expected)
  })

  it('exports diagnostics as JSON through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce('{"status":"ok"}')

    const exported = await exportDiagnostics()

    expect(invokeMock).toHaveBeenCalledWith('export_diagnostics')
    expect(exported).toBe('{"status":"ok"}')
  })
})
