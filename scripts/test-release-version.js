import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const fixture = await createGeneratedFixture({
  features: ['updater-release-workflow'],
})
try {
  const script = path.join(fixture.target, 'scripts/check-release-version.mjs')
  for (const version of [
    'v0.1.0',
    '0.1.0',
    'v9.0.0',
    '',
    'v0.1.0;echo unsafe',
  ]) {
    const result = await fixture.run(process.execPath, [script], {
      env: { ...process.env, RELEASE_VERSION: version },
    })
    assert.equal(result.exitCode === 0, version === 'v0.1.0', version)
  }
  const file = path.join(fixture.target, 'package.json')
  const pkg = JSON.parse(await readFile(file, 'utf8'))
  pkg.version = '0.2.0'
  await writeFile(file, JSON.stringify(pkg))
  const mismatch = await fixture.run(process.execPath, [script], {
    env: { ...process.env, RELEASE_VERSION: 'v0.1.0' },
  })
  assert.notEqual(mismatch.exitCode, 0)
  const workflow = await readFile(
    path.join(fixture.target, '.github/workflows/release.yml'),
    'utf8'
  )
  assert.ok(workflow.includes('inputs.version || github.ref_name'))
  assert.ok(
    workflow.indexOf('check-release-version.mjs') <
      workflow.indexOf('tauri-apps/tauri-action')
  )
} finally {
  await fixture.close()
}
console.log('Release tag/dispatch version contract passed without publishing')
