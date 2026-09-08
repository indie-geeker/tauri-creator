import { expect, it, vi } from 'vitest'
import { createSubmissionStore } from './submission-store'
it('preserves the latest precise sequence across delayed snapshots', () => {
  const store = createSubmissionStore()
  const listener = vi.fn()
  const stop = store.subscribe(listener)
  store.accept({ sequence: '9007199254740993', text: 'latest' })
  store.accept({ sequence: '2', text: 'late initial snapshot' })
  expect(store.getSnapshot()?.text).toBe('latest')
  expect(listener).toHaveBeenCalledOnce()
  stop()
  store.accept({ sequence: '9007199254740994', text: 'next' })
  expect(listener).toHaveBeenCalledOnce()
})
