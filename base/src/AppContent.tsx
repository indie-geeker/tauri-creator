import { invoke } from '@tauri-apps/api/core'

type AppContentProps = {
  message: string
  setMessage: (message: string) => void
}

export function AppContent({ message, setMessage }: AppContentProps) {
  async function greet() {
    const response = await invoke<string>('greet', { name: '{{APP_TITLE}}' })
    setMessage(response)
  }

  return (
    <main className="app-shell">
      <section className="app-panel">
        <p className="muted">{'{{APP_TITLE}}'}</p>
        <h1>Tauri Creator Base</h1>
        <p>
          This app starts with a minimal React and Tauri surface. Add optional
          features from the scaffold when the project needs them.
        </p>

        <div className="app-actions">
          <button type="button" onClick={greet}>
            Run sample command
          </button>
          <span>{message}</span>
        </div>
      </section>
    </main>
  )
}
