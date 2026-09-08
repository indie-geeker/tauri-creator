import { expect, it, vi } from 'vitest'
import { createRuntime } from './runtime'
it('shares startup and disposes in reverse order after the last consumer', async () => {
  const events: string[] = []
  const runtime = createRuntime([
    () => {
      events.push('start1')
      return () => events.push('stop1')
    },
    () => {
      events.push('start2')
      return () => events.push('stop2')
    },
  ])
  const [a, b] = await Promise.all([runtime.start(), runtime.start()])
  a()
  a()
  expect(events).toEqual(['start1', 'start2'])
  b()
  expect(events).toEqual(['start1', 'start2', 'stop2', 'stop1'])
})
it('cleans a pending initializer that resolves after HMR disposal', async () => {
  let resolve!: (dispose: () => void) => void
  const dispose = vi.fn()
  const runtime = createRuntime([
    () =>
      new Promise<() => void>(done => {
        resolve = done
      }),
  ])
  const pending = runtime.start()
  await Promise.resolve()
  runtime.dispose()
  resolve(dispose)
  const stop = await pending
  stop()
  expect(dispose).toHaveBeenCalledOnce()
})
it('unwinds completed initializers on failure', async () => {
  const stop = vi.fn()
  const runtime = createRuntime([
    () => stop,
    () => Promise.reject(new Error('startup failed')),
  ])
  await expect(runtime.start()).rejects.toThrow('startup failed')
  expect(stop).toHaveBeenCalledOnce()
})
it('propagates a synchronous startup error and allows a fresh start', async () => {
  let fail = true
  const stop = vi.fn()
  const runtime = createRuntime([
    () => {
      if (fail) throw new Error('native startup failed')
      return stop
    },
  ])
  await expect(runtime.start()).rejects.toThrow('native startup failed')
  fail = false
  const dispose = await runtime.start()
  dispose()
  expect(stop).toHaveBeenCalledOnce()
})
