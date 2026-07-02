import { invoke } from '@tauri-apps/api/core'

export const DIAGNOSTICS_FEATURE_ID = 'diagnostics'

export type DiagnosticsStatus = 'ok' | 'warning' | 'error'

export type DiagnosticsCheck = {
  name: string
  status: DiagnosticsStatus
  detail: string
}

export type DiagnosticsSnapshot = {
  appName: string
  appVersion: string
  platform: string
  arch: string
  appDataDir: string | null
  logDir: string | null
  status: DiagnosticsStatus
  checks: DiagnosticsCheck[]
}

export function collectDiagnostics(): Promise<DiagnosticsSnapshot> {
  return invoke<DiagnosticsSnapshot>('collect_diagnostics')
}

export function exportDiagnostics(): Promise<string> {
  return invoke<string>('export_diagnostics')
}
