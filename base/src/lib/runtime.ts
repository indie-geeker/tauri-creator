export type Dispose = () => void
export function createRuntime(
  starters: Array<() => Dispose | Promise<Dispose>>
) {
  type Generation = {
    cancelled: boolean
    references: number
    disposers: Dispose[]
    ready: Promise<void>
  }
  let current: Generation | undefined
  const stop = (generation: Generation) => {
    if (generation.cancelled) return
    generation.cancelled = true
    for (const dispose of generation.disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch (error) {
        console.error('Runtime cleanup failed', error)
      }
    }
    if (current === generation) current = undefined
  }
  return {
    async start(): Promise<Dispose> {
      if (!current) {
        const generation: Generation = {
          cancelled: false,
          references: 0,
          disposers: [],
          ready: Promise.resolve(),
        }
        current = generation
        generation.ready = Promise.resolve().then(async () => {
          try {
            for (const initialize of starters) {
              if (generation.cancelled) break
              const dispose = await initialize()
              if (generation.cancelled) dispose()
              else generation.disposers.push(dispose)
            }
          } catch (error) {
            stop(generation)
            throw error
          }
        })
      }
      const generation = current
      generation.references += 1
      try {
        await generation.ready
      } catch (error) {
        generation.references -= 1
        throw error
      }
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        if (--generation.references === 0) stop(generation)
      }
    },
    dispose() {
      if (current) stop(current)
    },
  }
}
