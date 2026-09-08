import { useSyncExternalStore } from 'react'
import type { QuickPaneReceipt } from '@/lib/tauri-bindings'
export function createSubmissionStore() {
  let latest: QuickPaneReceipt | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => latest,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    accept(receipt: QuickPaneReceipt | null) {
      if (!receipt || !/^[1-9][0-9]*$/.test(receipt.sequence)) return
      if (latest && BigInt(receipt.sequence) <= BigInt(latest.sequence)) return
      latest = receipt
      listeners.forEach(listener => listener())
    },
  }
}
export const submissionStore = createSubmissionStore()
export function useLatestSubmission() {
  return useSyncExternalStore(
    submissionStore.subscribe,
    submissionStore.getSnapshot,
    submissionStore.getSnapshot
  )
}
