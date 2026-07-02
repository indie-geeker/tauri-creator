import { invoke } from '@tauri-apps/api/core'

export type UpdaterState = 'disabled' | 'ready' | 'error'

export type UpdaterStatus = {
  configured: boolean
  status: UpdaterState
  reason: string
  endpoints: string[]
  endpointConfigured: boolean
  publicKeyConfigured: boolean
  missing: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function normalizeUpdaterStatus(value: unknown): UpdaterStatus {
  if (!isRecord(value)) {
    return {
      configured: false,
      status: 'error',
      reason: 'Invalid updater status returned by backend.',
      endpoints: [],
      endpointConfigured: false,
      publicKeyConfigured: false,
      missing: ['status'],
    }
  }

  const configured = value.configured === true
  const status =
    value.status === 'ready' ||
    value.status === 'disabled' ||
    value.status === 'error'
      ? value.status
      : configured
        ? 'ready'
        : 'disabled'
  const missing = stringArray(value.missing)

  return {
    configured,
    status,
    reason:
      typeof value.reason === 'string'
        ? value.reason
        : configured
          ? 'Updater is configured.'
          : 'Updater is not configured.',
    endpoints: stringArray(value.endpoints),
    endpointConfigured:
      typeof value.endpointConfigured === 'boolean'
        ? value.endpointConfigured
        : configured,
    publicKeyConfigured:
      typeof value.publicKeyConfigured === 'boolean'
        ? value.publicKeyConfigured
        : configured,
    missing,
  }
}

export async function getUpdaterStatus(): Promise<UpdaterStatus> {
  try {
    return normalizeUpdaterStatus(await invoke<unknown>('get_updater_status'))
  } catch (error) {
    return normalizeUpdaterStatus({
      configured: false,
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
      missing: ['backend'],
    })
  }
}
