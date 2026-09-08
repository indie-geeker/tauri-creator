import process from 'node:process'
import console from 'node:console'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'src/lib/tauri-bindings.ts')
const mode = process.argv[2]
if (mode !== 'generate' && mode !== 'check') {
  throw new Error('Usage: node scripts/check-bindings.mjs generate|check')
}
const temporary = await mkdtemp(path.join(tmpdir(), 'tauri-bindings-'))
try {
  const output = path.join(temporary, 'bindings.ts')
  execFileSync(
    'cargo',
    [
      'test',
      '--manifest-path',
      path.join(root, 'src-tauri/Cargo.toml'),
      'export_bindings',
      '--',
      '--ignored',
      '--nocapture',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, TAURI_CREATOR_BINDINGS_OUTPUT: output },
    }
  )
  // Fixed formatting keeps drift checks independent of optional formatting features.
  const rendered = await format(await readFile(output, 'utf8'), {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    arrowParens: 'avoid',
    endOfLine: 'lf',
  })
  if (mode === 'generate') {
    await writeFile(target, rendered)
    console.log('Generated src/lib/tauri-bindings.ts')
  } else {
    let current
    try {
      current = await readFile(target, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error('Bindings missing. Run bindings:generate first.')
      throw error
    }
    if (current !== rendered)
      throw new Error(
        'Bindings drift detected. Run bindings:generate and review the changes.'
      )
    console.log('Bindings match Rust commands and types.')
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
