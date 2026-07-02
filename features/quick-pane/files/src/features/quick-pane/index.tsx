import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Keyboard, PanelTopOpen, X, Zap } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import './quick-pane.css'

export const QUICK_PANE_FEATURE_ID = 'quick-pane'
export const DEFAULT_QUICK_PANE_SHORTCUT = 'CommandOrControl+Shift+.'
export const QUICK_PANE_STATE_CHANGED_EVENT = 'quick-pane-state-changed'
export const QUICK_PANE_SUBMIT_EVENT = 'quick-pane-submit'

export type QuickPaneState = {
  visible: boolean
  shortcut: string
  shortcutRegistered: boolean
  shortcutError: string | null
  windowError: string | null
}

export type QuickPanePanelProps = {
  onMessage?: (message: string) => void
}

export type QuickPaneSubmitPayload = {
  text?: unknown
}

export function getQuickPaneState(): Promise<QuickPaneState> {
  return invoke<QuickPaneState>('get_quick_pane_state')
}

export function showQuickPane(): Promise<QuickPaneState> {
  return invoke<QuickPaneState>('show_quick_pane')
}

export function dismissQuickPane(): Promise<QuickPaneState> {
  return invoke<QuickPaneState>('dismiss_quick_pane')
}

export function toggleQuickPane(): Promise<QuickPaneState> {
  return invoke<QuickPaneState>('toggle_quick_pane')
}

export function getDefaultQuickPaneShortcut(): Promise<string> {
  return invoke<string>('get_default_quick_pane_shortcut')
}

export function updateQuickPaneShortcut(
  shortcut: string | null
): Promise<QuickPaneState> {
  return invoke<QuickPaneState>('update_quick_pane_shortcut', { shortcut })
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

export function QuickPanePanel({ onMessage }: QuickPanePanelProps) {
  const [state, setState] = useState<QuickPaneState>({
    visible: false,
    shortcut: DEFAULT_QUICK_PANE_SHORTCUT,
    shortcutRegistered: false,
    shortcutError: null,
    windowError: null,
  })
  const [draft, setDraft] = useState('')
  const [submissions, setSubmissions] = useState<string[]>([])

  useEffect(() => {
    let active = true
    let cleanupState: (() => void) | undefined
    let cleanupSubmit: (() => void) | undefined

    function syncState(nextState: QuickPaneState) {
      if (!active) return

      setState(nextState)
      if (nextState.windowError) {
        onMessage?.(`Quick pane window failed: ${nextState.windowError}`)
      } else if (nextState.shortcutError) {
        onMessage?.(`Quick pane shortcut failed: ${nextState.shortcutError}`)
      } else if (nextState.shortcutRegistered) {
        onMessage?.('Quick pane shortcut registered')
      }
    }

    getQuickPaneState()
      .then(syncState)
      .catch((error: unknown) => {
        console.error('Quick pane state failed', error)
        onMessage?.(formatQuickPaneShortcutError(error))
      })

    void listen<QuickPaneState>(QUICK_PANE_STATE_CHANGED_EVENT, event => {
      syncState(event.payload)
    }).then(unlisten => {
      cleanupState = unlisten
    })

    void listen<QuickPaneSubmitPayload>(QUICK_PANE_SUBMIT_EVENT, event => {
      if (!active) return

      const submittedText = normalizeQuickPaneSubmissionText(event.payload)
      if (!submittedText) return

      setSubmissions(currentSubmissions =>
        [submittedText, ...currentSubmissions].slice(0, 5)
      )
      onMessage?.(formatQuickPaneSubmissionMessage(submittedText))
    }).then(unlisten => {
      cleanupSubmit = unlisten
    })

    return () => {
      active = false
      cleanupState?.()
      cleanupSubmit?.()
    }
  }, [onMessage])

  async function openPane() {
    const nextState = await showQuickPane()
    setState(nextState)
    onMessage?.(
      nextState.windowError
        ? `Quick pane window failed: ${nextState.windowError}`
        : 'Quick pane opened'
    )
  }

  async function closePane() {
    const nextState = await dismissQuickPane()
    setState(nextState)
    onMessage?.(
      nextState.windowError
        ? `Quick pane window failed: ${nextState.windowError}`
        : 'Quick pane dismissed'
    )
  }

  async function saveShortcut() {
    const nextState = await updateQuickPaneShortcut(state.shortcut)
    setState(nextState)
    if (nextState.shortcutError) {
      onMessage?.(`Quick pane shortcut failed: ${nextState.shortcutError}`)
    } else {
      onMessage?.(`Quick pane shortcut set to ${nextState.shortcut}`)
    }
  }

  function captureDraft() {
    const trimmedDraft = draft.trim()
    if (!trimmedDraft) return

    onMessage?.(`Captured: ${trimmedDraft}`)
    setDraft('')
  }

  return (
    <section className="quick-pane-panel" aria-label="Quick pane">
      <div className="quick-pane-toolbar">
        <div>
          <p className="quick-pane-kicker">
            {state.windowError
              ? 'Window unavailable'
              : state.shortcutError
                ? 'Shortcut unavailable'
                : state.shortcutRegistered
                  ? 'Global shortcut active'
                  : 'Registering shortcut'}
          </p>
          <h2>Quick pane</h2>
        </div>
        <div className="quick-pane-actions">
          <button
            aria-label="Open quick pane"
            title="Open quick pane"
            type="button"
            onClick={() => {
              void openPane()
            }}
          >
            <PanelTopOpen aria-hidden="true" size={16} strokeWidth={2} />
          </button>
          <button
            aria-label="Dismiss quick pane"
            title="Dismiss quick pane"
            type="button"
            onClick={() => {
              void closePane()
            }}
          >
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {state.visible ? (
        <div className="quick-pane-composer">
          <label>
            <span>Capture</span>
            <textarea
              rows={3}
              value={draft}
              onChange={event => setDraft(event.currentTarget.value)}
              placeholder="Write a note, command, or next action"
            />
          </label>
          <button
            className="quick-pane-primary"
            type="button"
            onClick={captureDraft}
          >
            <Zap aria-hidden="true" size={16} strokeWidth={2} />
            Capture
          </button>
        </div>
      ) : null}

      {submissions.length > 0 ? (
        <div className="quick-pane-submissions" aria-live="polite">
          <p>Recent submissions</p>
          <ul>
            {submissions.map((submission, index) => (
              <li key={`${submission}-${index}`}>{submission}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="quick-pane-shortcut">
        <Keyboard aria-hidden="true" size={16} strokeWidth={2} />
        <input
          aria-label="Quick pane shortcut"
          value={state.shortcut}
          onChange={event => {
            setState(currentState => ({
              ...currentState,
              shortcut: event.currentTarget.value,
            }))
          }}
        />
        <button
          type="button"
          onClick={() => {
            void saveShortcut()
          }}
        >
          Save
        </button>
      </div>
    </section>
  )
}

export function QuickPaneWindow() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    void getCurrentWindow()
      .onFocusChanged(async ({ payload: focused }) => {
        if (focused) {
          inputRef.current?.focus()
          return
        }

        await dismissWindow()
      })
      .then(unlisten => {
        cleanup = unlisten
      })

    return () => {
      cleanup?.()
    }
  }, [])

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
      await dismissQuickPane()
    } catch (error) {
      console.error('Quick pane dismiss failed', error)
    }
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedText = text.trim()
    if (trimmedText) {
      await emit(QUICK_PANE_SUBMIT_EVENT, { text: trimmedText })
      setText('')
    }

    await dismissWindow()
  }

  return (
    <form className="quick-pane-window" onSubmit={submitEntry}>
      <input
        ref={inputRef}
        aria-label="Quick pane input"
        className="quick-pane-window-input"
        value={text}
        onChange={event => setText(event.currentTarget.value)}
        placeholder="Enter text..."
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </form>
  )
}
