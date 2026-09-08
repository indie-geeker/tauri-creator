import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function change(f, action, feature) {
  return f.run(process.execPath, [
    path.join(root, `scripts/${action}-feature.js`),
    '--target',
    f.target,
    '--feature',
    feature,
  ])
}
for (const feature of ['dx-tools', 'ui-layout', 'ui-shadcn']) {
  const f = await createGeneratedFixture({ features: ['ui-tailwind'] })
  try {
    const before = JSON.parse(
      await readFile(path.join(f.target, 'package.json'), 'utf8')
    )
    const config = JSON.parse(
      await readFile(path.join(f.target, 'src-tauri/tauri.conf.json'), 'utf8')
    )
    assert.equal((await change(f, 'apply', feature)).exitCode, 0)
    assert.equal((await change(f, 'remove', feature)).exitCode, 0)
    const after = JSON.parse(
      await readFile(path.join(f.target, 'package.json'), 'utf8')
    )
    for (const key of feature === 'dx-tools'
      ? ['check:all', 'rust:fmt', 'rust:fmt:check']
      : ['rust:fmt', 'rust:fmt:check'])
      assert.equal(
        after.scripts[key],
        before.scripts[key],
        feature + ' restores ' + key
      )
    const nextConfig = JSON.parse(
      await readFile(path.join(f.target, 'src-tauri/tauri.conf.json'), 'utf8')
    )
    assert.deepEqual(
      nextConfig.app.windows.find((w) => w.label === 'main'),
      config.app.windows[0]
    )
    await readFile(path.join(f.target, 'src/lib/utils.ts'))
  } finally {
    await f.close()
  }
}
const f = await createGeneratedFixture({ features: ['ui-tailwind'] })
try {
  const file = path.join(f.target, 'src/AppContent.tsx')
  const original = await readFile(file, 'utf8')
  const custom = original + '\n// user work\n'
  await writeFile(file, custom)
  const state = await readFile(
    path.join(f.target, '.tauri-creator.json'),
    'utf8'
  )
  assert.notEqual((await change(f, 'apply', 'ui-layout')).exitCode, 0)
  assert.equal(await readFile(file, 'utf8'), custom)
  assert.equal(
    await readFile(path.join(f.target, '.tauri-creator.json'), 'utf8'),
    state
  )
} finally {
  await f.close()
}
console.log('Feature roundtrip and customization protection passed')
