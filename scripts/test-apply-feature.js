import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function apply(f, feature, extra = []) {
  return f.run(process.execPath, [
    path.join(root, 'scripts/apply-feature.js'),
    '--target',
    f.target,
    '--feature',
    feature,
    ...extra,
  ])
}
async function json(f, file) {
  return JSON.parse(await readFile(path.join(f.target, file), 'utf8'))
}
const f = await createGeneratedFixture()
try {
  const before = await readFile(
    path.join(f.target, '.tauri-creator.json'),
    'utf8'
  )
  assert.equal((await apply(f, 'sqlite', ['--dry-run'])).exitCode, 0)
  assert.equal(
    await readFile(path.join(f.target, '.tauri-creator.json'), 'utf8'),
    before
  )
  assert.equal((await apply(f, 'sqlite')).exitCode, 0)
  const state = await json(f, '.tauri-creator.json')
  assert.deepEqual(
    state.resolvedFeatures,
    state.enabledFeatures,
    'resolved metadata must reflect current closure'
  )
  for (const name of ['specta-bindings', 'preferences', 'app-state', 'sqlite'])
    assert.ok(state.enabledFeatures.includes(name))
  assert.ok(
    (
      await readFile(path.join(f.target, 'src/generated/providers.tsx'), 'utf8')
    ).includes('QueryClientProvider')
  )
  const source = await readFile(
    path.join(f.target, 'src-tauri/src/generated/commands.rs'),
    'utf8'
  )
  assert.ok(source.includes('create_note'))
  assert.equal((await apply(f, 'sqlite')).exitCode, 0)
  assert.deepEqual(
    (await json(f, '.tauri-creator.json')).enabledFeatures,
    state.enabledFeatures
  )
  const custom = path.join(f.target, 'src/custom.txt')
  await writeFile(custom, '{{APP_NAME}} user text')
  assert.equal((await apply(f, 'updater')).exitCode, 0)
  await assert.rejects(
    access(path.join(f.target, '.github/workflows/release.yml'))
  )
  assert.equal((await apply(f, 'updater-release-workflow')).exitCode, 0)
  const workflow = await readFile(
    path.join(f.target, '.github/workflows/release.yml'),
    'utf8'
  )
  assert.ok(workflow.includes('inputs.version || github.ref_name'))
  assert.ok(workflow.includes('releaseDraft: true'))
  assert.equal(await readFile(custom, 'utf8'), '{{APP_NAME}} user text')
} finally {
  await f.close()
}
const conflict = await createGeneratedFixture()
try {
  await mkdir(path.join(conflict.target, 'src/features/preferences'), {
    recursive: true,
  })
  const file = path.join(conflict.target, 'src/features/preferences/index.ts')
  await writeFile(file, 'export const userWork = true\n')
  const before = await readFile(
    path.join(conflict.target, '.tauri-creator.json'),
    'utf8'
  )
  const result = await apply(conflict, 'preferences')
  assert.notEqual(result.exitCode, 0)
  assert.ok(result.stderr.includes('src/features/preferences/index.ts'))
  assert.equal(await readFile(file, 'utf8'), 'export const userWork = true\n')
  assert.equal(
    await readFile(path.join(conflict.target, '.tauri-creator.json'), 'utf8'),
    before
  )
  await assert.rejects(
    access(path.join(conflict.target, 'src-tauri/src/bindings.rs'))
  )
} finally {
  await conflict.close()
}
console.log('apply-feature transaction and composition tests passed')
