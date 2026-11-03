import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = await mkdtemp(path.join(os.tmpdir(), 'tauri-agent-guidance-'))

function run(script, args) {
  // Exercise the same absolute-path invocation used by the personal skill.
  return execFileSync(
    process.execPath,
    [path.join(root, 'scripts', script), ...args],
    {
      cwd: scratch,
      encoding: 'utf8',
      stdio: 'pipe',
    }
  )
}

async function read(target, file) {
  return readFile(path.join(target, file), 'utf8')
}

async function verifyGuidance(target) {
  const state = JSON.parse(await read(target, '.tauri-creator.json'))
  const pkg = JSON.parse(await read(target, 'package.json'))
  const commands = []
  const docs = ['AGENTS.md', 'README.md', 'PROJECT_MAP.md']
  for (const file of docs) {
    const content = await read(target, file)
    assert.doesNotMatch(content, /{{[A-Z][A-Z0-9_]*}}/, file)
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0]
      if (!link || /^[a-z]+:/i.test(link)) continue
      const linked = await stat(path.resolve(target, path.dirname(file), link))
      assert.ok(
        linked.isFile() || linked.isDirectory(),
        `${file}: existing link ${link}`
      )
    }
    for (const match of content.matchAll(
      /`(npm|pnpm) (install|run ([\w:-]+))`/g
    )) {
      assert.equal(
        match[1],
        state.packageManager,
        `${file}: correct package manager`
      )
      if (match[3]) {
        assert.ok(pkg.scripts[match[3]], `${file}: runnable script ${match[3]}`)
        commands.push(match[3])
      }
    }
  }
  assert.equal(
    commands.includes('bindings:generate'),
    state.enabledFeatures.includes('specta-bindings')
  )
  assert.ok(commands.includes('check:all'))
  assert.ok(commands.includes('tauri:dev'))

  // Every feature-document link must belong to a currently enabled feature.
  const expectedDocs = new Set()
  for (const name of state.enabledFeatures) {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'features', name, 'feature.json'), 'utf8')
    )
    for (const file of manifest.files ?? []) {
      if (file.startsWith('docs/features/') && file.endsWith('.md'))
        expectedDocs.add(file)
    }
  }
  const map = await read(target, 'PROJECT_MAP.md')
  const linkedDocs = new Set(
    [...map.matchAll(/\]\((docs\/features\/[^)]+)\)/g)].map(match => match[1])
  )
  assert.deepEqual(linkedDocs, expectedDocs)
}

try {
  const minimal = path.join(scratch, 'minimal demo')
  run('create-app.js', [
    '--name',
    'minimal-demo',
    '--target',
    minimal,
    '--recipe',
    'minimal',
  ])
  await verifyGuidance(minimal)
  const originalMap = await read(minimal, 'PROJECT_MAP.md')
  const customGuidance = `${await read(minimal, 'AGENTS.md')}\n## Product decisions\n\nKeep exports offline.\n`
  await writeFile(path.join(minimal, 'AGENTS.md'), customGuidance)

  const args = ['--target', minimal, '--feature', 'preferences']
  const stateBeforePreview = await read(minimal, '.tauri-creator.json')
  run('apply-feature.js', [...args, '--dry-run'])
  assert.equal(await read(minimal, 'PROJECT_MAP.md'), originalMap)
  assert.equal(await read(minimal, '.tauri-creator.json'), stateBeforePreview)
  run('apply-feature.js', args)
  await verifyGuidance(minimal)
  run('remove-feature.js', args)
  await verifyGuidance(minimal) // Dependency remains enabled until explicitly removed.
  run('remove-feature.js', [
    '--target',
    minimal,
    '--feature',
    'specta-bindings',
  ])
  await verifyGuidance(minimal)
  assert.equal(await read(minimal, 'PROJECT_MAP.md'), originalMap)
  assert.equal(await read(minimal, 'AGENTS.md'), customGuidance)

  for (const [recipe, manager] of [
    ['starter', 'pnpm'],
    ['full', 'npm'],
  ]) {
    const target = path.join(scratch, `${recipe}-${manager}`)
    run('create-app.js', [
      '--name',
      `${recipe}-demo`,
      '--target',
      target,
      '--recipe',
      recipe,
      '--package-manager',
      manager,
    ])
    await verifyGuidance(target)
  }
  console.log(
    'Agent guidance: recipe outputs, commands, links and feature roundtrip passed'
  )
} finally {
  await rm(scratch, { recursive: true, force: true })
}
