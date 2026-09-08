import assert from 'node:assert/strict'
import { renderCheckScripts } from './generated-checks.js'
for (const packageManager of ['npm', 'pnpm']) {
  const a = renderCheckScripts({
    packageManager,
    enabledFeatures: ['specta-bindings', 'dx-tools'],
  })
  const b = renderCheckScripts({
    packageManager,
    enabledFeatures: ['dx-tools', 'specta-bindings'],
  })
  assert.deepEqual(a, b)
  assert.ok(
    a['check:all'].indexOf('bindings:check') <
      a['check:all'].indexOf('typecheck')
  )
  for (const name of ['rust:fmt:check', 'rust:test', 'rust:clippy', 'test:run'])
    assert.ok(a['check:all'].includes(`${packageManager} run ${name}`))
  const minimal = renderCheckScripts({ packageManager, enabledFeatures: [] })
  assert.ok(!minimal['check:all'].includes('bindings'))
  assert.ok(!minimal['check:all'].includes('clippy'))
}
console.log('Generated check script composition passed')

// Exercise the real renderer/transaction path, including both application orders.
const { createGeneratedFixture } = await import('./lib/generated-fixture.js')
const { readFile } = await import('node:fs/promises')
const { default: path } = await import('node:path')
const { fileURLToPath } = await import('node:url')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const order of [
  ['specta-bindings', 'dx-tools'],
  ['dx-tools', 'specta-bindings'],
]) {
  const fixture = await createGeneratedFixture()
  try {
    for (const feature of order) {
      const result = await fixture.run(process.execPath, [
        path.join(root, 'scripts/apply-feature.js'),
        '--target',
        fixture.target,
        '--feature',
        feature,
      ])
      assert.equal(result.exitCode, 0, result.stderr)
    }
    const readPackage = async () =>
      JSON.parse(
        await readFile(path.join(fixture.target, 'package.json'), 'utf8')
      )
    assert.equal(
      (await readPackage()).scripts['check:all'],
      renderCheckScripts({ packageManager: 'npm', enabledFeatures: order })[
        'check:all'
      ]
    )
    const result = await fixture.run(process.execPath, [
      path.join(root, 'scripts/remove-feature.js'),
      '--target',
      fixture.target,
      '--feature',
      'dx-tools',
    ])
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(
      (await readPackage()).scripts['check:all'],
      renderCheckScripts({
        packageManager: 'npm',
        enabledFeatures: ['specta-bindings'],
      })['check:all']
    )
  } finally {
    await fixture.close()
  }
}
console.log('Actual apply/remove check composition passed in both orders')
