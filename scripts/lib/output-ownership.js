import { formatJson } from './json-format.js'
import { reconcileToml } from './toml-merge.js'
import {
  lstat,
  readdir,
  readFile,
  mkdir,
  writeFile,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import { absent, reconcileManagedValue } from './config-merge.js'
export async function inventory(dir, prefix = '') {
  const files = new Map()
  for (const entry of await readdir(path.join(dir, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink())
      throw new Error(`Symbolic link in managed output: ${relative}`)
    if (entry.isDirectory())
      for (const [key, value] of await inventory(dir, relative))
        files.set(key, value)
    else files.set(relative, await readFile(path.join(dir, relative)))
  }
  return files
}
async function safeRead(root, relative) {
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Symbolic link in managed path: ${relative}`)
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }
  try {
    return await readFile(current)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}
const same = (a, b) => a === b || (a && b && a.equals(b))
export async function planOutputs(target, previous, next) {
  if ((await lstat(target)).isSymbolicLink())
    throw new Error('Symbolic link target refused')
  const changes = []
  for (const relative of new Set([...previous.keys(), ...next.keys()])) {
    const before = previous.get(relative),
      after = next.get(relative)
    if (same(before, after)) continue
    const current = await safeRead(target, relative)
    let result = after
    if (!same(current, before)) {
      if (relative.endsWith('.json')) {
        const parse = (b) =>
          b === undefined ? absent : JSON.parse(b.toString())
        const value = reconcileManagedValue(
          parse(current),
          parse(before),
          parse(after),
          relative
        )
        result = value === absent ? undefined : Buffer.from(formatJson(value))
      } else if (
        current &&
        before &&
        current.toString().replaceAll('\r\n', '\n') === before.toString()
      ) {
        result = after && Buffer.from(after.toString().replaceAll('\n', '\r\n'))
      } else if (relative.endsWith('.toml') && current && before && after) {
        result = Buffer.from(
          reconcileToml(current.toString(), before.toString(), after.toString())
        )
      } else
        throw new Error(
          `Conflict: modified or unknown baseline for ${relative}`
        )
    }
    changes.push({ relative, before: current, after: result })
  }
  return changes.sort(
    (a, b) =>
      (a.relative === '.tauri-creator.json') -
      (b.relative === '.tauri-creator.json')
  )
}
export async function applyOutputs(target, changes) {
  // Recheck the entire plan before touching any file, then recheck each write.
  for (const change of changes)
    if (!same(await safeRead(target, change.relative), change.before))
      throw new Error(`Concurrent modification: ${change.relative}`)
  const written = []
  async function write(relative, buffer) {
    const file = path.join(target, relative)
    if (buffer === undefined) {
      try {
        await unlink(file)
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
      }
    } else {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, buffer)
    }
  }
  try {
    for (const change of changes) {
      if (!same(await safeRead(target, change.relative), change.before))
        throw new Error(`Concurrent modification: ${change.relative}`)
      written.push(change)
      await write(change.relative, change.after)
    }
  } catch (error) {
    const errors = []
    for (const change of written.reverse())
      try {
        const current = await safeRead(target, change.relative)
        if (same(current, change.before)) continue
        if (!same(current, change.after))
          throw new Error(
            'concurrent change or partial write; preserved for manual recovery'
          )
        await write(change.relative, change.before)
      } catch (e) {
        errors.push(`${change.relative}: ${e.message}`)
      }
    throw new Error(
      `${error.message}; rollback ${errors.length ? `incomplete: ${errors.join('; ')}` : 'completed (process-level only)'}`
    )
  }
}
