/** Explicit test double. Tests must opt each command in; unknown calls reject. */
export function createTauriMocks() {
  const handlers = new Map<
    string,
    (args?: Record<string, unknown>) => unknown
  >()
  let unlistenCount = 0
  const pending: Array<() => void> = []
  return {
    handlers,
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      const handler = handlers.get(command)
      if (!handler)
        return Promise.reject(new Error(`Unexpected invoke: ${command}`))
      return Promise.resolve().then(() => handler(args) as T)
    },
    listen(): Promise<() => void> {
      return new Promise(resolve =>
        pending.push(() => {
          let disposed = false
          resolve(() => {
            if (!disposed) {
              disposed = true
              unlistenCount += 1
            }
          })
        })
      )
    },
    resolveListeners() {
      pending.splice(0).forEach(resolve => resolve())
    },
    get unlistenCount() {
      return unlistenCount
    },
  }
}
