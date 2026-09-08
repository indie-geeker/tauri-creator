import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { planOutputs, applyOutputs } from './lib/output-ownership.js'
import { absent, reconcileManagedValue } from './lib/config-merge.js'
import { reconcileToml } from './lib/toml-merge.js'
const temp = await mkdtemp(path.join(os.tmpdir(), 'tauri-ownership-'))
const buffer = (text) => Buffer.from(text)
try {
  await writeFile(path.join(temp, 'code.ts'), 'old\r\n')
  const changes = await planOutputs(
    temp,
    new Map([['code.ts', buffer('old\n')]]),
    new Map([['code.ts', buffer('new\n')]])
  )
  await applyOutputs(temp, changes)
  assert.equal(await readFile(path.join(temp, 'code.ts'), 'utf8'), 'new\r\n')
  await writeFile(path.join(temp, 'code.ts'), 'concurrent edit')
  await assert.rejects(applyOutputs(temp, changes), /Concurrent modification/)
  assert.equal(
    await readFile(path.join(temp, 'code.ts'), 'utf8'),
    'concurrent edit'
  )
  await mkdir(path.join(temp, 'outside'))
  await symlink(
    path.join(temp, 'outside'),
    path.join(temp, 'link'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await assert.rejects(
    planOutputs(temp, new Map(), new Map([['link/file', buffer('no')]])),
    /Symbolic link/
  )
  const before = {
    app: { windows: [{ label: 'main', width: 1000 }] },
    plugins: {},
  }
  const current = {
    ...before,
    app: {
      windows: [
        { label: 'main', width: 1100 },
        { label: 'user', width: 400 },
      ],
    },
    nullable: null,
  }
  const next = {
    app: {
      windows: [
        { label: 'main', width: 1000 },
        { label: 'quick-pane', width: 600 },
      ],
    },
    plugins: {},
  }
  const merged = reconcileManagedValue(current, before, next)
  assert.equal(merged.app.windows[0].width, 1100)
  assert.deepEqual(
    merged.app.windows.map((w) => w.label),
    ['main', 'user', 'quick-pane']
  )
  assert.equal(merged.nullable, null)
  assert.equal(reconcileManagedValue(null, absent, absent), null)
  assert.throws(
    () => reconcileManagedValue(null, absent, 'owned'),
    /Modified managed/
  )
  const previous = '[dependencies]\na = "1"\n'
  const actual =
    previous + 'user = "2"\n\n[package.metadata.user]\nflag = true\n'
  const future = '[dependencies]\na = "1"\nb = "3"\n'
  const toml = reconcileToml(actual, previous, future)
  assert.ok(toml.includes('user = "2"'))
  assert.ok(toml.includes('[package.metadata.user]\nflag = true'))
  assert.ok(toml.includes('b = "3"'))
  assert.throws(
    () =>
      reconcileToml(
        actual.replace('a = "1"', 'a = "9"'),
        previous,
        '[dependencies]\na = "2"\n'
      ),
    /Modified managed/
  )
  assert.throws(
    () => reconcileToml('[dependencies]\nx = [\n "a"\n]\n', previous, future),
    /Unsupported multiline/
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
console.log(
  'Ownership, concurrent preflight, symlink, CRLF and configuration reconciliation passed'
)
