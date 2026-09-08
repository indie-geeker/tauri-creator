/** Dispose even if native registration completes after the caller unmounts. */
export function disposeAsyncSubscription(
  subscribe: () => Promise<() => void>,
  onError: (error: unknown) => void
): () => void {
  let disposed = false
  let unlisten: (() => void) | undefined
  void Promise.resolve()
    .then(subscribe)
    .then(stop => {
      if (disposed) stop()
      else unlisten = stop
    })
    .catch(error => {
      if (!disposed) onError(error)
    })
  return () => {
    if (disposed) return
    disposed = true
    unlisten?.()
    unlisten = undefined
  }
}
