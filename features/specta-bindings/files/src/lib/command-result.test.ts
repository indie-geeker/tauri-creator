import { describe, expect, it } from 'vitest'
import { unwrapCommandResult } from './command-result'

describe('Specta Result adapter', () => {
  it('returns successful payloads including null', async () => {
    await expect(
      unwrapCommandResult(Promise.resolve({ status: 'ok', data: 'value' }))
    ).resolves.toBe('value')
    await expect(
      unwrapCommandResult(Promise.resolve({ status: 'ok', data: null }))
    ).resolves.toBeNull()
  })
  it('rejects the string error Result returned by generated commands', async () => {
    await expect(
      unwrapCommandResult(
        Promise.resolve({ status: 'error', error: 'disk full' })
      )
    ).rejects.toThrow('disk full')
  })
  it('preserves transport errors', async () => {
    const error = new Error('transport unavailable')
    await expect(unwrapCommandResult(Promise.reject(error))).rejects.toBe(error)
  })
})
