import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  type AppCommand,
  createCommand,
  createCommandRegistry,
} from '../../shared/commands'
import './command-palette.css'

export const COMMAND_PALETTE_FEATURE_ID = 'command-palette'

export type CommandPalettePanelProps = {
  commands: AppCommand[]
  query?: string
}

export function createDefaultCommands(
  setMessage: (message: string) => void
): AppCommand[] {
  return [
    createCommand({
      id: 'app:status',
      title: 'Show app status',
      group: 'App',
      keywords: ['ready', 'health'],
      run: () => setMessage('Command palette is ready'),
    }),
    createCommand({
      id: 'app:sample-command',
      title: 'Run sample command',
      group: 'App',
      keywords: ['greet', 'demo'],
      run: () => setMessage('Sample command selected from the palette'),
    }),
  ]
}

export function CommandPalettePanel({
  commands,
  query,
}: CommandPalettePanelProps) {
  const [isOpen, setIsOpen] = useState(Boolean(query))
  const [internalQuery, setInternalQuery] = useState('')
  const activeQuery = query ?? internalQuery
  const registry = useMemo(() => createCommandRegistry(commands), [commands])
  const visibleCommands = registry.search(activeQuery)
  const isControlledQuery = query !== undefined

  useEffect(() => {
    if (isControlledQuery) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return

      event.preventDefault()
      setIsOpen(open => !open)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isControlledQuery])

  if (!isControlledQuery && !isOpen) {
    return null
  }

  return (
    <section className="command-palette-panel" aria-label="Command palette">
      <div className="command-palette-header">
        <Search aria-hidden="true" size={16} strokeWidth={2} />
        <input
          aria-label="Search commands"
          placeholder="Search commands"
          value={activeQuery}
          onChange={event => setInternalQuery(event.currentTarget.value)}
        />
      </div>
      <div className="command-palette-list">
        {visibleCommands.length === 0 ? (
          <p className="command-palette-empty">No commands found.</p>
        ) : (
          visibleCommands.map(command => (
            <button
              className="command-palette-item"
              key={command.id}
              type="button"
              onClick={() => {
                void registry.run(command.id)
              }}
            >
              <span>{command.title}</span>
              {command.group ? <small>{command.group}</small> : null}
            </button>
          ))
        )}
      </div>
    </section>
  )
}
