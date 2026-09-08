import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function succeeds(fixture, command, args) {
  const result = await fixture.run(command, args)
  assert.equal(
    result.exitCode,
    0,
    `${command} ${args.join(' ')}\n${result.stderr}\n${result.stdout}\nLogs: ${fixture.logs}`
  )
}
async function app(options, check) {
  const fixture = await createGeneratedFixture(options)
  let passed = false
  try {
    await check(fixture)
    passed = true
  } finally {
    await fixture.close({ preserve: !passed })
  }
}
const cases = {
  async names() {
    await app({ generate: false }, async (f) => {
      for (const name of ['123-demo', '', '!!!']) {
        const result = await f.run(
          process.execPath,
          [
            path.join(root, 'scripts/create-app.js'),
            '--name',
            name,
            '--target',
            f.target,
            '--recipe',
            'minimal',
          ],
          { cwd: root }
        )
        assert.notEqual(
          result.exitCode,
          0,
          `invalid Cargo name accepted: ${name}`
        )
        await assert.rejects(access(f.target))
      }
    })
  },
  async titlebar() {
    await app({ features: ['custom-titlebar'] }, async (f) => {
      await succeeds(f, 'npm', ['install'])
      await succeeds(f, 'npm', ['run', 'typecheck'])
      await succeeds(f, 'npm', ['run', 'test:run'])
      await succeeds(f, 'npm', ['run', 'build'])
    })
  },
  async bindings() {
    await app({ recipe: 'full' }, async (f) => {
      await succeeds(f, 'npm', ['install'])
      await succeeds(f, 'npm', ['run', 'rust:bindings'])
      await succeeds(f, 'npm', ['run', 'bindings:generate'])
      await succeeds(f, 'npm', ['run', 'bindings:check'])
      await succeeds(f, 'npm', ['run', 'typecheck'])
      const bindingPath = path.join(f.target, 'src/lib/tauri-bindings.ts')
      const initial = await readFile(bindingPath, 'utf8')
      await succeeds(f, 'npm', ['run', 'bindings:generate'])
      assert.equal(
        await readFile(bindingPath, 'utf8'),
        initial,
        'two exports must be deterministic'
      )
      const backendPath = path.join(
        f.target,
        'src-tauri/src/features/updater.rs'
      )
      const backend = await readFile(backendPath, 'utf8')
      await writeFile(
        backendPath,
        backend.replace(/\breason\b/g, 'reason_renamed')
      )
      const drift = await f.run('npm', ['run', 'bindings:check'])
      assert.notEqual(drift.exitCode, 0)
      assert.ok(
        (drift.stdout + drift.stderr).includes('Bindings drift detected')
      )
      assert.equal(
        await readFile(bindingPath, 'utf8'),
        initial,
        'check must not modify committed bindings'
      )
      await succeeds(f, 'npm', ['run', 'bindings:generate'])
      const mismatch = await f.run('npm', ['run', 'typecheck'])
      assert.notEqual(mismatch.exitCode, 0)
      assert.ok((mismatch.stdout + mismatch.stderr).includes('reason'))
      await writeFile(backendPath, backend)
      await succeeds(f, 'npm', ['run', 'bindings:generate'])
      await succeeds(f, 'npm', ['run', 'typecheck'])
    })
  },
  async 'repeat-check'() {
    await app({ recipe: 'full' }, async (f) => {
      await succeeds(f, 'npm', ['install'])
      const pkg = JSON.parse(
        await readFile(path.join(f.target, 'package.json'), 'utf8')
      )
      if (pkg.scripts['bindings:generate'])
        await succeeds(f, 'npm', ['run', 'bindings:generate'])
      for (const script of ['check:all', 'build', 'check:all'])
        await succeeds(f, 'npm', ['run', script])
    })
  },
  async 'updater-configured'() {
    await app({ features: ['updater'] }, async (f) => {
      const configPath = path.join(f.target, 'src-tauri/tauri.conf.json')
      const config = JSON.parse(await readFile(configPath, 'utf8'))
      config.plugins.updater = {
        pubkey: 'fixture-public-key',
        endpoints: [
          'https://example.com/{{target}}/{{arch}}/{{current_version}}',
        ],
      }
      await writeFile(configPath, JSON.stringify(config, null, 2))
      await succeeds(f, 'cargo', [
        'test',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        'features::updater',
      ])
    })
  },
  async 'feature-roundtrip'() {
    await app({}, async (f) => {
      const before = JSON.parse(
        await readFile(path.join(f.target, 'package.json'), 'utf8')
      )
      await succeeds(f, process.execPath, [
        path.join(root, 'scripts/apply-feature.js'),
        '--target',
        f.target,
        '--feature',
        'dx-tools',
      ])
      await succeeds(f, process.execPath, [
        path.join(root, 'scripts/remove-feature.js'),
        '--target',
        f.target,
        '--feature',
        'dx-tools',
      ])
      const after = JSON.parse(
        await readFile(path.join(f.target, 'package.json'), 'utf8')
      )
      assert.deepEqual(after.scripts, before.scripts)
    })
  },
}
const option = process.argv.indexOf('--case')
const selected = option < 0 ? 'all' : process.argv[option + 1]
if (selected !== 'all' && !cases[selected])
  throw new Error(`Unknown contract case: ${selected}`)
for (const name of selected === 'all' ? Object.keys(cases) : [selected]) {
  try {
    await cases[name]()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack}`)
    process.exitCode = 1
  }
}
