import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QUICK_PANE_SHORTCUT,
  QuickPanePanel,
  QuickPaneWindow,
  formatQuickPaneShortcutError,
  formatQuickPaneSubmissionMessage,
  formatQuickPaneWindowError,
  getDefaultQuickPaneShortcut,
  getQuickPaneState,
  normalizeQuickPaneSubmissionText,
  updateQuickPaneShortcut,
} from './index'

const invokeMock = vi.hoisted(() => vi.fn())
const emitMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn())
const onFocusChangedMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: emitMock,
  listen: listenMock,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onFocusChanged: onFocusChangedMock,
  }),
}))

describe('quick-pane feature', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    emitMock.mockReset()
    listenMock.mockReset()
    onFocusChangedMock.mockReset()
  })

  it('loads quick-pane state from the backend', async () => {
    invokeMock.mockResolvedValueOnce({
      visible: false,
      shortcut: DEFAULT_QUICK_PANE_SHORTCUT,
      shortcutRegistered: true,
      shortcutError: null,
      windowError: null,
    })

    const state = await getQuickPaneState()

    expect(invokeMock).toHaveBeenCalledWith('get_quick_pane_state')
    expect(state).toEqual({
      visible: false,
      shortcut: DEFAULT_QUICK_PANE_SHORTCUT,
      shortcutRegistered: true,
      shortcutError: null,
      windowError: null,
    })
  })

  it('asks the backend to update the registered shortcut', async () => {
    invokeMock.mockResolvedValueOnce({
      visible: false,
      shortcut: 'CommandOrControl+Alt+Space',
      shortcutRegistered: true,
      shortcutError: null,
      windowError: null,
    })

    await updateQuickPaneShortcut('CommandOrControl+Alt+Space')

    expect(invokeMock).toHaveBeenCalledWith('update_quick_pane_shortcut', {
      shortcut: 'CommandOrControl+Alt+Space',
    })
  })

  it('loads the default shortcut from the backend', async () => {
    invokeMock.mockResolvedValueOnce(DEFAULT_QUICK_PANE_SHORTCUT)

    const shortcut = await getDefaultQuickPaneShortcut()

    expect(invokeMock).toHaveBeenCalledWith('get_default_quick_pane_shortcut')
    expect(shortcut).toBe(DEFAULT_QUICK_PANE_SHORTCUT)
  })

  it('asks the backend to restore the default shortcut', async () => {
    invokeMock.mockResolvedValueOnce({
      visible: false,
      shortcut: DEFAULT_QUICK_PANE_SHORTCUT,
      shortcutRegistered: true,
      shortcutError: null,
      windowError: null,
    })

    await updateQuickPaneShortcut(null)

    expect(invokeMock).toHaveBeenCalledWith('update_quick_pane_shortcut', {
      shortcut: null,
    })
  })

  it('renders the quick-pane controls', () => {
    const html = renderToStaticMarkup(<QuickPanePanel />)

    expect(html).toContain('Quick pane')
    expect(html).toContain(DEFAULT_QUICK_PANE_SHORTCUT)
    expect(html).toContain('Open quick pane')
  })

  it('renders the secondary quick-pane window entry', () => {
    const html = renderToStaticMarkup(<QuickPaneWindow />)

    expect(html).toContain('Quick pane input')
    expect(html).toContain('Enter text...')
  })

  it('preserves string errors from the shortcut backend', () => {
    expect(formatQuickPaneShortcutError('accelerator parse failed')).toBe(
      'Quick pane shortcut failed: accelerator parse failed'
    )
  })

  it('preserves string errors from the window backend', () => {
    expect(formatQuickPaneWindowError('quick-pane.html missing')).toBe(
      'Quick pane window failed: quick-pane.html missing'
    )
  })

  it('normalizes submitted quick-pane text for main-window feedback', () => {
    expect(normalizeQuickPaneSubmissionText({ text: '  Capture this  ' })).toBe(
      'Capture this'
    )
    expect(formatQuickPaneSubmissionMessage('Capture this')).toBe(
      'Quick pane submitted: Capture this'
    )
  })

  it('ignores blank submitted quick-pane text', () => {
    expect(normalizeQuickPaneSubmissionText({ text: '   ' })).toBeNull()
    expect(normalizeQuickPaneSubmissionText(null)).toBeNull()
  })
})
