import { formatJson } from './json-format.js'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFeatureCatalog, resolveFeatures } from './feature-catalog.js'
import { inventory, planOutputs, applyOutputs } from './output-ownership.js'
import { renderProjectMap } from '../project-map.js'
import { templateValuesFromState } from '../template-renderer.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
async function renderExpected(
  directory,
  state,
  enabled,
  catalog,
  updateResolution = false
) {
  const suffix = '.' + state.packageName.replaceAll('-', '.')
  if (!state.bundleIdentifier.endsWith(suffix))
    throw new Error('Unknown bundle identifier baseline; migrate manually')
  const args = [
    path.join(root, 'scripts/create-app.js'),
    '--name',
    state.packageName,
    '--target',
    directory,
    '--package-manager',
    state.packageManager,
    '--author',
    state.author,
    '--license',
    state.license,
    '--bundle-prefix',
    state.bundleIdentifier.slice(0, -suffix.length),
    '--window-width',
    String(state.window.width),
    '--window-height',
    String(state.window.height),
  ]
  if (enabled.length) args.push('--features', enabled.join(','))
  else args.push('--recipe', 'minimal')
  if (enabled.includes('ui-layout'))
    args.push('--sidebar', state.options?.layout?.sidebar ?? 'both')
  try {
    execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' })
  } catch (e) {
    throw new Error(
      `Preflight render failed: ${e.stderr?.toString() || e.message}`
    )
  }
  const generated = JSON.parse(
    await readFile(path.join(directory, '.tauri-creator.json'), 'utf8')
  )
  if (generated.productName !== state.productName)
    throw new Error('Unknown productName baseline; migrate manually')
  const updated = { ...state, enabledFeatures: generated.enabledFeatures }
  if (updateResolution) updated.resolvedFeatures = generated.enabledFeatures
  await writeFile(
    path.join(directory, '.tauri-creator.json'),
    formatJson(updated)
  )
  await writeFile(
    path.join(directory, 'PROJECT_MAP.md'),
    renderProjectMap(updated, catalog)
  )
  return inventory(directory)
}
export async function changeFeature({
  target,
  feature,
  action,
  dryRun = false,
}) {
  const state = JSON.parse(
    await readFile(path.join(target, '.tauri-creator.json'), 'utf8')
  )
  templateValuesFromState(state)
  if (state.schemaVersion !== 2)
    throw new Error('Unknown scaffold baseline schema; migrate manually')
  const catalog = await loadFeatureCatalog(root)
  if (!catalog.has(feature)) throw new Error(`unknown feature '${feature}'`)
  const old = state.enabledFeatures ?? []
  let enabled
  if (action === 'apply') enabled = resolveFeatures([...old, feature], catalog)
  else {
    for (const name of old)
      if (
        name !== feature &&
        resolveFeatures([name], catalog).includes(feature)
      )
        throw new Error(`cannot remove '${feature}': '${name}' depends on it`)
    enabled = old.filter((name) => name !== feature)
  }
  if (JSON.stringify(old) === JSON.stringify(enabled)) {
    console.log(
      `${action === 'apply' ? 'Applied features' : 'Removed feature'}: none`
    )
    return
  }
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tauri-change-plan-'))
  try {
    const previous = await renderExpected(
      path.join(scratch, 'before'),
      state,
      old,
      catalog
    )
    const next = await renderExpected(
      path.join(scratch, 'after'),
      state,
      enabled,
      catalog,
      true
    )
    const changes = await planOutputs(target, previous, next)
    if (dryRun) {
      console.log(
        action === 'apply'
          ? `Dry run: would apply features: ${enabled.filter((n) => !old.includes(n)).join(', ')}`
          : `Dry run: would remove feature: ${feature}`
      )
      console.log(
        changes
          .map((c) => `${c.after ? 'write' : 'remove'} ${c.relative}`)
          .join('\n')
      )
      return
    }
    await applyOutputs(target, changes)
    console.log(
      action === 'apply'
        ? `Applied features: ${enabled.filter((n) => !old.includes(n)).join(', ')}`
        : `Removed feature: ${feature}`
    )
    console.log(
      `Target: ${target}\nEnabled features: ${enabled.join(', ') || 'none'}`
    )
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
export async function featureCli(action, argv) {
  const options = { action }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: node scripts/${action}-feature.js --target <path> --feature <name> [--dry-run]`
      )
      return
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (
      !['--target', '--feature'].includes(arg) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    )
      throw new Error(`Invalid argument: ${arg}`)
    options[arg.slice(2)] = argv[++i]
  }
  if (!options.target || !options.feature)
    throw new Error('missing required --target or --feature')
  options.target = path.resolve(options.target)
  await changeFeature(options)
}
