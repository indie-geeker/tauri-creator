import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ listen: vi.fn(), latest: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@/lib/tauri-bindings', () => ({
  commands: { getLatestQuickPaneEntry: native.latest },
}))
const releases: Array<() => void> = []
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
})
afterEach(() => {
  releases
    .splice(0)
    .reverse()
    .forEach(stop => stop())
  vi.restoreAllMocks()
})
async function setup() {
  const { startSubmissionRuntime } = await import('./submission-runtime')
  const { submissionStore } = await import('./submission-store')
  return {
    store: submissionStore,
    start() {
      const stop = startSubmissionRuntime()
      releases.push(stop)
      return stop
    },
  }
}
it('shares one listener and snapshot load until the last consumer releases', async () => {
  const unlisten = vi.fn()
  native.listen.mockResolvedValue(unlisten)
  native.latest.mockResolvedValue({
    status: 'ok',
    data: { sequence: '1', text: 'restored' },
  })
  const runtime = await setup()
  const first = runtime.start(),
    second = runtime.start()
  await vi.waitFor(() =>
    expect(runtime.store.getSnapshot()?.text).toBe('restored')
  )
  expect(native.listen).toHaveBeenCalledOnce()
  expect(native.latest).toHaveBeenCalledOnce()
  first()
  first()
  expect(unlisten).not.toHaveBeenCalled()
  second()
  second()
  expect(unlisten).toHaveBeenCalledOnce()
  const third = runtime.start()
  await vi.waitFor(() => expect(native.listen).toHaveBeenCalledTimes(2))
  third()
  await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(2))
})
it('keeps a live submission newer than a delayed initial snapshot', async () => {
  let callback!: (event: {
    payload: { sequence: string; text: string }
  }) => void
  let resolve!: (result: unknown) => void
  native.listen.mockImplementation((_event, next) => {
    callback = next
    return Promise.resolve(vi.fn())
  })
  native.latest.mockReturnValue(
    new Promise(done => {
      resolve = done
    })
  )
  const runtime = await setup()
  runtime.start()
  await vi.waitFor(() => expect(native.latest).toHaveBeenCalledOnce())
  callback({ payload: { sequence: '2', text: 'live' } })
  resolve({ status: 'ok', data: { sequence: '1', text: 'stale' } })
  await new Promise(done => setTimeout(done, 0))
  expect(runtime.store.getSnapshot()).toEqual({ sequence: '2', text: 'live' })
})
it('releases a late listener and never fetches a snapshot after disposal', async () => {
  let resolve!: (stop: () => void) => void
  const unlisten = vi.fn()
  native.listen.mockReturnValue(
    new Promise(done => {
      resolve = done
    })
  )
  const runtime = await setup()
  const stop = runtime.start()
  await vi.waitFor(() => expect(native.listen).toHaveBeenCalledOnce())
  stop()
  stop()
  resolve(unlisten)
  await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce())
  expect(native.latest).not.toHaveBeenCalled()
})
it('ignores late snapshot and events after the last consumer releases', async () => {
  let callback!: (event: {
    payload: { sequence: string; text: string }
  }) => void
  let resolve!: (result: unknown) => void
  native.listen.mockImplementation((_event, next) => {
    callback = next
    return Promise.resolve(vi.fn())
  })
  native.latest.mockReturnValue(
    new Promise(done => {
      resolve = done
    })
  )
  const runtime = await setup()
  const stop = runtime.start()
  await vi.waitFor(() => expect(native.latest).toHaveBeenCalledOnce())
  stop()
  callback({ payload: { sequence: '2', text: 'late event' } })
  resolve({ status: 'ok', data: { sequence: '1', text: 'late snapshot' } })
  await new Promise(done => setTimeout(done, 0))
  expect(runtime.store.getSnapshot()).toBeNull()
})
it('reports listener failure, skips snapshot, and can restart after release', async () => {
  const error = new Error('listen denied'),
    report = vi.spyOn(console, 'error').mockImplementation(() => {})
  native.listen.mockRejectedValueOnce(error).mockResolvedValueOnce(vi.fn())
  native.latest.mockResolvedValue({ status: 'ok', data: null })
  const runtime = await setup()
  const stop = runtime.start()
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith('Quick pane listener failed', error)
  )
  expect(native.latest).not.toHaveBeenCalled()
  stop()
  runtime.start()
  await vi.waitFor(() => expect(native.latest).toHaveBeenCalledOnce())
})
it('reports snapshot failure but retains the listener for later submissions and cleanup', async () => {
  let callback!: (event: {
    payload: { sequence: string; text: string }
  }) => void
  const unlisten = vi.fn(),
    report = vi.spyOn(console, 'error').mockImplementation(() => {})
  native.listen.mockImplementation((_event, next) => {
    callback = next
    return Promise.resolve(unlisten)
  })
  native.latest.mockResolvedValue({
    status: 'error',
    error: 'snapshot unavailable',
  })
  const runtime = await setup()
  const stop = runtime.start()
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith(
      'Quick pane snapshot failed',
      expect.any(Error)
    )
  )
  callback({ payload: { sequence: '1', text: 'recovered via event' } })
  expect(runtime.store.getSnapshot()?.text).toBe('recovered via event')
  stop()
  expect(unlisten).toHaveBeenCalledOnce()
})
