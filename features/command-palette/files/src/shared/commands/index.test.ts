import { describe, expect, it, vi } from 'vitest'
import { createCommand, createCommandRegistry } from './index'

describe('command registry', () => {
  it('filters commands by title and keywords', () => {
    const registry = createCommandRegistry([
      createCommand({
        id: 'app:about',
        title: 'Show app status',
        keywords: ['health'],
        run: () => {},
      }),
      createCommand({
        id: 'diagnostics:export',
        title: 'Export diagnostics',
        keywords: ['support'],
        run: () => {},
      }),
    ])

    expect(registry.search('support').map(command => command.id)).toEqual([
      'diagnostics:export',
    ])
    expect(registry.search('status').map(command => command.id)).toEqual([
      'app:about',
    ])
  })

  it('runs a command by id', async () => {
    const run = vi.fn()
    const registry = createCommandRegistry([
      createCommand({
        id: 'app:ready',
        title: 'Mark ready',
        run,
      }),
    ])

    await registry.run('app:ready')

    expect(run).toHaveBeenCalledTimes(1)
  })
})
