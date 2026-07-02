export type AppCommand = {
  id: string
  title: string
  keywords?: string[]
  group?: string
  run: () => void | Promise<void>
}

export function createCommand(command: AppCommand): AppCommand {
  return command
}

export type CommandRegistry = {
  all: () => AppCommand[]
  search: (query: string) => AppCommand[]
  run: (id: string) => Promise<void>
}

function commandMatches(command: AppCommand, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  const searchableText = [
    command.id,
    command.title,
    command.group,
    ...(command.keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return searchableText.includes(normalizedQuery)
}

export function createCommandRegistry(commands: AppCommand[]): CommandRegistry {
  const commandMap = new Map(commands.map(command => [command.id, command]))

  return {
    all: () => [...commands],
    search: query => commands.filter(command => commandMatches(command, query)),
    run: async id => {
      const command = commandMap.get(id)
      if (!command) {
        throw new Error(`Unknown command: ${id}`)
      }

      await command.run()
    },
  }
}
