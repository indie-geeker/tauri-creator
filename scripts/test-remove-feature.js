import assert from 'node:assert/strict'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function remove(f, feature, extra = []) {
  return f.run(process.execPath, [
    path.join(root, 'scripts/remove-feature.js'),
    '--target',
    f.target,
    '--feature',
    feature,
    ...extra,
  ])
}
const f = await createGeneratedFixture({
  features: ['preferences', 'sqlite', 'ui-shadcn', 'dx-tools'],
})
try {
  const stateFile = path.join(f.target, '.tauri-creator.json'),
    before = await readFile(stateFile, 'utf8')
  assert.notEqual((await remove(f, 'specta-bindings')).exitCode, 0)
  assert.equal(await readFile(stateFile, 'utf8'), before)
  assert.equal((await remove(f, 'sqlite', ['--dry-run'])).exitCode, 0)
  await access(path.join(f.target, 'src/features/sqlite/index.ts'))
  assert.equal((await remove(f, 'sqlite')).exitCode, 0)
  await assert.rejects(
    access(path.join(f.target, 'src/features/sqlite/index.ts'))
  )
  const commands = await readFile(
    path.join(f.target, 'src-tauri/src/generated/commands.rs'),
    'utf8'
  )
  assert.ok(!commands.includes('create_note'))
  const cargo = await readFile(
    path.join(f.target, 'src-tauri/Cargo.toml'),
    'utf8'
  )
  assert.ok(!cargo.includes('rusqlite ='))
  assert.equal((await remove(f, 'ui-shadcn')).exitCode, 0)
  await access(path.join(f.target, 'src/lib/utils.ts'))
  assert.equal((await remove(f, 'dx-tools')).exitCode, 0)
  const pkg = JSON.parse(
    await readFile(path.join(f.target, 'package.json'), 'utf8')
  )
  assert.ok(pkg.scripts['check:all'].includes('bindings:check'))
  assert.ok(!pkg.scripts['check:all'].includes('clippy'))
  const file = path.join(f.target, 'src/features/preferences/index.ts')
  const custom = (await readFile(file, 'utf8')) + '\n// user work\n'
  await writeFile(file, custom)
  // app-state depends on preferences; remove it first, then verify file ownership protection.
  assert.equal((await remove(f, 'app-state')).exitCode, 0)
  const stateBefore = await readFile(stateFile, 'utf8')
  assert.notEqual((await remove(f, 'preferences')).exitCode, 0)
  assert.equal(await readFile(file, 'utf8'), custom)
  assert.equal(await readFile(stateFile, 'utf8'), stateBefore)
} finally {
  await f.close()
}
console.log('remove-feature dependency, ownership and restoration tests passed')
