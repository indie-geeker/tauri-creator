import { commands } from '@/lib/tauri-bindings'
import { unwrapCommandResult } from '@/lib/command-result'
import type {
  DiagnosticsSnapshot,
  DiagnosticsCheck,
} from '@/lib/tauri-bindings'
export type {
  DiagnosticsSnapshot,
  DiagnosticsCheck,
} from '@/lib/tauri-bindings'
export type DiagnosticsStatus = DiagnosticsCheck['status']

export const DIAGNOSTICS_FEATURE_ID = 'diagnostics'

export function collectDiagnostics(): Promise<DiagnosticsSnapshot> {
  return commands.collectDiagnostics()
}

export function exportDiagnostics(): Promise<string> {
  return unwrapCommandResult(commands.exportDiagnostics())
}
