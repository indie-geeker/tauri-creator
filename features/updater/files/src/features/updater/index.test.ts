import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getUpdaterStatus, normalizeUpdaterStatus } from './index'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('updater feature', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('loads updater status through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce({
      configured: false,
      status: 'disabled',
      reason: 'Updater public key is not configured.',
      endpoints: ['https://example.com/latest.json'],
      endpointConfigured: true,
      publicKeyConfigured: false,
      missing: ['publicKey'],
    })

    const status = await getUpdaterStatus()

    expect(invokeMock).toHaveBeenCalledWith('get_updater_status')
    expect(status.configured).toBe(false)
    expect(status.status).toBe('disabled')
    expect(status.publicKeyConfigured).toBe(false)
  })

  it('normalizes configured updater status', () => {
    expect(
      normalizeUpdaterStatus({
        configured: true,
        status: 'ready',
        reason: 'Updater is configured.',
        endpoints: ['https://example.com/latest.json'],
        endpointConfigured: true,
        publicKeyConfigured: true,
        missing: [],
      })
    ).toEqual({
      configured: true,
      status: 'ready',
      reason: 'Updater is configured.',
      endpoints: ['https://example.com/latest.json'],
      endpointConfigured: true,
      publicKeyConfigured: true,
      missing: [],
    })
  })

  it('normalizes disabled and error updater states', () => {
    expect(normalizeUpdaterStatus({ configured: false })).toMatchObject({
      configured: false,
      status: 'disabled',
      endpointConfigured: false,
      publicKeyConfigured: false,
    })

    expect(normalizeUpdaterStatus(null)).toMatchObject({
      configured: false,
      status: 'error',
      reason: expect.stringContaining('Invalid updater status'),
    })
  })
})
