import { existsSync } from 'node:fs'
import path from 'node:path'
/** Execute package-manager JS entrypoints directly on Windows, without cmd.exe interpolation. */
export function processCommand(command, args) {
  if (process.platform !== 'win32' || !['npm', 'pnpm'].includes(command))
    return { command, args }
  const bin = command === 'npm' ? 'npm/bin/npm-cli.js' : 'pnpm/bin/pnpm.cjs'
  const roots = [
    path.dirname(process.execPath),
    ...(process.env.PATH ?? '').split(path.delimiter),
  ]
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'npm'))
  const entry = roots
    .map((root) => path.join(root, 'node_modules', bin))
    .find((candidate) => existsSync(candidate))
  if (!entry)
    throw new Error(
      `Cannot locate ${command} JS entrypoint; install the pinned package manager before verification`
    )
  return { command: process.execPath, args: [entry, ...args] }
}
