import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const f = await createGeneratedFixture({ recipe: 'full' })
try {
  const main = JSON.parse(
    await readFile(
      path.join(f.target, 'src-tauri/capabilities/main.json'),
      'utf8'
    )
  )
  const quick = JSON.parse(
    await readFile(
      path.join(f.target, 'src-tauri/capabilities/quick-pane.json'),
      'utf8'
    )
  )
  assert.deepEqual(main.windows, ['main'])
  assert.deepEqual(quick.windows, ['quick-pane'])
  assert.ok(main.permissions.includes('allow-patch-preferences'))
  assert.ok(!quick.permissions.includes('allow-patch-preferences'))
  assert.ok(!quick.permissions.includes('updater:default'))
  assert.ok(quick.permissions.includes('allow-submit-quick-pane'))
  const build = await readFile(
    path.join(f.target, 'src-tauri/build.rs'),
    'utf8'
  )
  assert.ok(build.includes('AppManifest::new().commands(COMMAND_NAMES)'))
} finally {
  await f.close()
}
console.log(
  'Window capability generation passed; native enforcement requires runtime acceptance'
)
