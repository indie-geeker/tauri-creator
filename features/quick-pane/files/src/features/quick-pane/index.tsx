import { unwrapCommandResult } from '@/lib/command-result'
import { disposeAsyncSubscription } from '@/lib/async-subscription'
import { useLatestSubmission } from './submission-store'
import { commands } from '@/lib/tauri-bindings'
import type { QuickPaneState } from '@/lib/tauri-bindings'
export type { QuickPaneState } from '@/lib/tauri-bindings'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import './quick-pane.css'

export const QUICK_PANE_FEATURE_ID = 'quick-pane'
export const DEFAULT_QUICK_PANE_SHORTCUT = 'CommandOrControl+Shift+.'
export const QUICK_PANE_STATE_CHANGED_EVENT = 'quick-pane-state-changed'
export const QUICK_PANE_SUBMIT_EVENT = 'quick-pane-submit'

export type QuickPanePanelProps = {
  onMessage?: (message: string) => void
}

export type QuickPaneSubmitPayload = {
  text?: unknown
}

export function getQuickPaneState(): Promise<QuickPaneState> {
  return commands.getQuickPaneState()
}

export function showQuickPane(): Promise<QuickPaneState> {
  return commands.showQuickPane()
}

export function dismissQuickPane(): Promise<QuickPaneState> {
  return commands.dismissQuickPane()
}

export function toggleQuickPane(): Promise<QuickPaneState> {
  return commands.toggleQuickPane()
}

export function getDefaultQuickPaneShortcut(): Promise<string> {
  return commands.getDefaultQuickPaneShortcut()
}

export function updateQuickPaneShortcut(
  shortcut: string | null | undefined
): Promise<QuickPaneState> {
  return commands.updateQuickPaneShortcut(shortcut ?? null)
}

export function formatQuickPaneShortcutError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Quick pane shortcut failed: ${message}`
}

export function formatQuickPaneWindowError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Quick pane window failed: ${message}`
}

export function normalizeQuickPaneSubmissionText(
  payload: QuickPaneSubmitPayload | null
): string | null {
  if (!payload || typeof payload.text !== 'string') return null

  const trimmedText = payload.text.trim()
  return trimmedText.length > 0 ? trimmedText : null
}

export function formatQuickPaneSubmissionMessage(text: string): string {
  return `Quick pane submitted: ${text}`
}

export function QuickPaneReceiptView() {
  const receipt = useLatestSubmission()
  return receipt ? <p role="status">Received this run: {receipt.text}</p> : null
}

export function QuickPanePanel({ onMessage }: QuickPanePanelProps) {
  const [state, setState] = useState<QuickPaneState | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void getQuickPaneState()
      .then(value => {
        if (active) setState(value)
      })
      .catch(reason => {
        if (active) setError(String(reason))
      })
    const stop = disposeAsyncSubscription(
      () =>
        listen<QuickPaneState>(QUICK_PANE_STATE_CHANGED_EVENT, event => {
          if (active) setState(event.payload)
        }),
      reason => {
        if (active) setError(String(reason))
      }
    )
    return () => {
      active = false
      stop()
    }
  }, [])
  const perform = async (action: () => Promise<QuickPaneState>) => {
    try {
      const value = await action()
      setState(value)
      setError(value.windowError ?? value.shortcutError ?? null)
      onMessage?.('Quick pane state updated')
    } catch (reason) {
      setError(String(reason))
    }
  }
  return (
    <section className="quick-pane-panel" aria-label="Quick pane">
      <h2>Quick pane</h2>
      <p>{state?.shortcut ?? DEFAULT_QUICK_PANE_SHORTCUT}</p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        aria-label="Open quick pane"
        onClick={() => {
          void perform(showQuickPane)
        }}
      >
        Open quick pane
      </button>
      <button
        type="button"
        aria-label="Dismiss quick pane"
        onClick={() => {
          void perform(dismissQuickPane)
        }}
      >
        Dismiss quick pane
      </button>
      <QuickPaneReceiptView />
    </section>
  )
}

export function QuickPaneWindow() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(
    () =>
      disposeAsyncSubscription(
        () =>
          getCurrentWindow().onFocusChanged(({ payload: focused }) => {
            if (focused) inputRef.current?.focus()
            else if (!submitting.current) void dismissWindow()
          }),
        reason => setError(String(reason))
      ),
    []
  )

  useEffect(() => {
    async function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return

      event.preventDefault()
      await dismissWindow()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function dismissWindow() {
    try {
      const result = await dismissQuickPane()
      if (result.windowError) setError(result.windowError)
    } catch (error) {
      setError(String(error))
    }
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedText = text.trim()
    if (!trimmedText || submitting.current) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      await unwrapCommandResult(commands.submitQuickPane(trimmedText))
      setText('')
      await dismissWindow()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <form className="quick-pane-window" onSubmit={submitEntry}>
      {error && <p role="alert">{error}</p>}
      <input
        ref={inputRef}
        disabled={pending}
        aria-label="Quick pane input"
        className="quick-pane-window-input"
        value={text}
        onChange={event => {
          if (!submitting.current) setText(event.currentTarget.value)
        }}
        placeholder="Enter text..."
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </form>
  )
}
