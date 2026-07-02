import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  trace: logMocks.trace,
  debug: logMocks.debug,
  info: logMocks.info,
  warn: logMocks.warn,
  error: logMocks.error,
}))

import { info, logger, serializeContext, warn } from './logger'

async function flushAsyncLogs(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('logger', () => {
  beforeEach(() => {
    for (const mock of Object.values(logMocks)) {
      mock.mockReset()
      mock.mockResolvedValue(undefined)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serializes structured context for plugin key values', () => {
    expect(
      serializeContext({
        count: 2,
        ok: true,
        nested: { area: 'startup' },
        missing: null,
      })
    ).toEqual({
      count: '2',
      ok: 'true',
      nested: '{"area":"startup"}',
      missing: 'null',
    })
  })

  it('writes info logs to the console and Tauri log plugin', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

    logger.info('Application started', { area: 'startup' })
    await flushAsyncLogs()

    expect(consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'Application started',
      { area: 'startup' }
    )
    expect(logMocks.info).toHaveBeenCalledWith('Application started', {
      keyValues: { area: 'startup' },
    })
  })

  it('keeps convenience helpers bound to the logger instance', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    info('Ready')
    warn('Careful')
    await flushAsyncLogs()

    expect(logMocks.info).toHaveBeenCalledWith('Ready', undefined)
    expect(logMocks.warn).toHaveBeenCalledWith('Careful', undefined)
  })
})
