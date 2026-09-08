// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBar } from './TitleBar'

const native = vi.hoisted(() => ({
  close: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
  platform: vi.fn(),
  isTauri: vi.fn(),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: native.isTauri }))
vi.mock('@tauri-apps/plugin-os', () => ({ platform: native.platform }))
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  native.isTauri.mockReturnValue(true)
  native.platform.mockReturnValue('windows')
  native.isMaximized.mockResolvedValue(false)
  native.onResized.mockResolvedValue(vi.fn())
})
describe('TitleBar independent window contract', () => {
  it('uses an explicit Linux browser fallback without querying the native plugin', () => {
    native.isTauri.mockReturnValue(false)
    render(<TitleBar />)
    expect(native.platform).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close window' })).toBeNull()
  })
  it('renders title and caller actions without business providers', () => {
    render(
      <TitleBar
        title="Editor"
        leading={<button>Back</button>}
        trailing={<button>Help</button>}
      />
    )
    expect(screen.getByText('Editor')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy()
  })
  it.each(['windows', 'macos'] as const)(
    'uses native controls on %s',
    async forcePlatform => {
      render(<TitleBar forcePlatform={forcePlatform} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
      fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
      fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }))
      await waitFor(() => expect(native.maximize).toHaveBeenCalledOnce())
      native.isMaximized.mockResolvedValue(true)
      fireEvent.click(screen.getByRole('button', { name: 'Restore window' }))
      await waitFor(() => expect(native.unmaximize).toHaveBeenCalledOnce())
      expect(native.close).toHaveBeenCalledOnce()
      expect(native.minimize).toHaveBeenCalledOnce()
    }
  )
  it('keeps native Linux controls outside the toolbar', () => {
    render(<TitleBar forcePlatform="linux" />)
    expect(screen.queryByRole('button', { name: 'Close window' })).toBeNull()
    expect(native.onResized).not.toHaveBeenCalled()
  })
  it('reports rejected native operations', async () => {
    const error = new Error('permission denied')
    native.close.mockRejectedValue(error)
    const onWindowError = vi.fn()
    render(<TitleBar onWindowError={onWindowError} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    await waitFor(() => expect(onWindowError).toHaveBeenCalledWith(error))
  })
  it('disposes a resize listener that resolves after unmount', async () => {
    const stop = vi.fn()
    let resolve!: (dispose: () => void) => void
    native.onResized.mockReturnValue(
      new Promise<() => void>(done => {
        resolve = done
      })
    )
    const view = render(<TitleBar />)
    await waitFor(() => expect(native.onResized).toHaveBeenCalledOnce())
    view.unmount()
    resolve(stop)
    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
  })
  it('reports a rejected listener registration', async () => {
    const error = new Error('listen denied')
    native.onResized.mockRejectedValue(error)
    const onWindowError = vi.fn()
    render(<TitleBar onWindowError={onWindowError} />)
    await waitFor(() => expect(onWindowError).toHaveBeenCalledWith(error))
  })
})

it('ignores an initial state read that finishes after a window operation', async () => {
  let resolve!: (maximized: boolean) => void
  native.isMaximized.mockReturnValueOnce(
    new Promise<boolean>(done => {
      resolve = done
    })
  )
  render(<TitleBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Restore window' })).toBeTruthy()
  )
  await act(async () => {
    resolve(false)
  })
  expect(screen.getByRole('button', { name: 'Restore window' })).toBeTruthy()
})
