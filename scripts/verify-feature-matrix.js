import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { loadFeatureCatalog, resolveFeatures } from './lib/feature-catalog.js'
import { createGeneratedFixture } from './lib/generated-fixture.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export async function featureMatrix() {
  const catalog = await loadFeatureCatalog(root)
  const entries = [...catalog].map(([name, { manifest }]) => ({
    id: name,
    features: [name],
    closure: resolveFeatures([name], catalog),
    supported: !['unsupported', 'experimental'].includes(manifest.status),
  }))
  for (const features of [
    ['ui-tailwind', 'ui-shadcn'],
    ['ui-layout', 'quick-pane'],
    ['custom-titlebar', 'i18n'],
    ['preferences', 'ui-shadcn'],
    ['updater', 'project-governance'],
    ['updater', 'updater-release-workflow'],
  ])
    entries.push({
      id: features.join('+'),
      features,
      closure: resolveFeatures(features, catalog),
      supported: true,
    })
  const full = JSON.parse(
    await readFile(path.join(root, 'recipes/full.json'), 'utf8')
  )
  const features = [...full.features, 'custom-titlebar']
  entries.push({
    id: 'full+custom-titlebar',
    features,
    closure: resolveFeatures(features, catalog),
    supported: true,
  })
  return entries
}
async function main() {
  const args = process.argv.slice(2),
    get = (key) =>
      args.includes(key) ? args[args.indexOf(key) + 1] : undefined
  const packageManager = get('--package-manager') ?? 'npm',
    selected = get('--only')?.split(',')
  const entries = (await featureMatrix()).filter(
    (entry) => !selected || selected.includes(entry.id)
  )
  if (selected && entries.length !== selected.length)
    throw new Error('Unknown --only matrix entry')
  if (args.includes('--list')) {
    console.log(JSON.stringify(entries, null, 2))
    return
  }
  const evidence = path.resolve(
    get('--output') ?? path.join(os.tmpdir(), `tauri-matrix-${Date.now()}`)
  )
  await mkdir(evidence, { recursive: true })
  const results = []
  for (const entry of entries) {
    if (!entry.supported) {
      results.push({ ...entry, status: 'unsupported' })
      continue
    }
    console.log(`Checking ${entry.id} (${packageManager})`)
    const record = {
      ...entry,
      packageManager,
      node: process.version,
      status: 'running',
    }
    let fixture
    try {
      fixture = await createGeneratedFixture({
        features: entry.features,
        packageManager,
      })
      const commands = []
      if (!args.includes('--quick')) {
        commands.push([packageManager, ['install']])
        if (entry.closure.includes('specta-bindings'))
          commands.push([packageManager, ['run', 'bindings:generate']])
        for (const script of [
          'typecheck',
          'test:run',
          'rust:fmt:check',
          'rust:test',
          'build',
        ])
          commands.push([packageManager, ['run', script]])
      }
      for (const [command, argv] of commands) {
        const result = await fixture.run(command, argv, {
          env: {
            ...process.env,
            CARGO_TARGET_DIR:
              process.env.CARGO_TARGET_DIR ??
              path.join(os.tmpdir(), 'tauri-matrix-cargo'),
          },
        })
        if (result.exitCode !== 0)
          throw new Error(
            `${command} ${argv.join(' ')} failed (${result.exitCode}); ${fixture.logs}`
          )
      }
      if (!args.includes('--quick')) {
        const lock = await readFile(
          path.join(
            fixture.target,
            packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'
          )
        )
        record.lockSha256 = createHash('sha256').update(lock).digest('hex')
      }
      record.status = args.includes('--quick') ? 'structure-only' : 'passed'
    } catch (error) {
      record.status = 'failed'
      record.error = error.message
      process.exitCode = 1
    } finally {
      if (fixture) {
        await cp(fixture.logs, path.join(evidence, entry.id), {
          recursive: true,
        })
        await fixture.close({ preserve: record.status === 'failed' })
      }
      results.push(record)
      await writeFile(
        path.join(evidence, 'results.json'),
        JSON.stringify(results, null, 2) + '\n'
      )
    }
  }
  console.log(`Matrix evidence: ${evidence}`)
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main()
