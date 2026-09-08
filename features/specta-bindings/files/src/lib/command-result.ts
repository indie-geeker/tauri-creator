import type { Result } from './tauri-bindings'

/** Only Rust Result commands use this adapter; plain-return commands stay plain. */
export async function unwrapCommandResult<T>(
  result: Promise<Result<T, string>>
): Promise<T> {
  const resolved = await result
  if (resolved.status === 'error') throw new Error(resolved.error)
  return resolved.data
}
