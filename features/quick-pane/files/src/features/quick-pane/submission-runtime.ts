import { listen } from '@tauri-apps/api/event'
import { commands, type QuickPaneReceipt } from '@/lib/tauri-bindings'
import { unwrapCommandResult } from '@/lib/command-result'
import { disposeAsyncSubscription } from '@/lib/async-subscription'
import { submissionStore } from './submission-store'
let references = 0
let dispose: (() => void) | undefined
export function startSubmissionRuntime(): () => void {
  references += 1
  if (references === 1) {
    let active = true
    const stop = disposeAsyncSubscription(
      async () => {
        const unlisten = await listen<QuickPaneReceipt>(
          'quick-pane-submit',
          event => {
            if (active) submissionStore.accept(event.payload)
          }
        )
        if (active)
          void unwrapCommandResult(commands.getLatestQuickPaneEntry())
            .then(receipt => {
              if (active) submissionStore.accept(receipt)
            })
            .catch(error => {
              if (active) console.error('Quick pane snapshot failed', error)
            })
        return unlisten
      },
      error => console.error('Quick pane listener failed', error)
    )
    dispose = () => {
      active = false
      stop()
    }
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    if (--references === 0) {
      dispose?.()
      dispose = undefined
    }
  }
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    dispose?.()
    dispose = undefined
    references = 0
  })
