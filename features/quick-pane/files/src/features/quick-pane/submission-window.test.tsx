// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuickPaneWindow } from './index'
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  focus: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: native.listen,
  emit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onFocusChanged: native.focus }),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  native.focus.mockResolvedValue(vi.fn())
  native.listen.mockResolvedValue(vi.fn())
})
it('keeps the draft until backend receipt and allows retry after rejection', async () => {
  let reject!: (reason: Error) => void
  native.invoke.mockImplementation((command: string) => {
    if (command === 'submit_quick_pane')
      return new Promise((_resolve, fail) => {
        reject = fail
      })
    if (command === 'dismiss_quick_pane')
      return Promise.resolve({ visible: false })
    throw new Error(`Unexpected command: ${command}`)
  })
  render(<QuickPaneWindow />)
  const input = screen.getByRole('textbox') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'capture me' } })
  fireEvent.submit(input.form as HTMLFormElement)
  await waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith('submit_quick_pane', {
      text: 'capture me',
    })
  )
  expect(input.value).toBe('capture me')
  await act(async () => reject(new Error('backend failed')))
  expect(input.value).toBe('capture me')
  expect(screen.getByRole('alert').textContent).toContain('backend failed')
  native.invoke.mockResolvedValueOnce({ sequence: '1', text: 'capture me' })
  fireEvent.submit(input.form as HTMLFormElement)
  await waitFor(() => expect(input.value).toBe(''))
  expect(native.invoke).toHaveBeenCalledWith('dismiss_quick_pane')
})
it('releases a focus listener registered after unmount exactly once', async () => {
  let resolve!: (stop: () => void) => void
  const stop = vi.fn()
  native.focus.mockReturnValue(
    new Promise<() => void>(done => {
      resolve = done
    })
  )
  const view = render(<QuickPaneWindow />)
  await waitFor(() => expect(native.focus).toHaveBeenCalledOnce())
  view.unmount()
  await act(async () => resolve(stop))
  expect(stop).toHaveBeenCalledOnce()
})
