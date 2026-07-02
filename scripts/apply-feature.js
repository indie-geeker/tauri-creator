import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProjectMap } from './project-map.js'
import { syncSpectaBindings } from './specta-bindings.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseDir = path.join(root, 'base')
const featuresDir = path.join(root, 'features')

function printUsage() {
  console.log(`Usage: node scripts/apply-feature.js --target <path> --feature <feature-name>

Options:
  --target     Generated app directory.
  --feature    Feature name from features/*/feature.json.
  --dry-run    Print planned changes without writing files.
`)
}

function fail(message) {
  console.error(`apply-feature: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }

    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (!arg.startsWith('--')) {
      fail(`unexpected positional argument '${arg}'`)
    }

    const key = arg.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      fail(`missing value for --${key}`)
    }

    args[key] = value
    index += 1
  }

  return args
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${error.message})`)
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function loadFeatureManifests() {
  const entries = await readdir(featuresDir, { withFileTypes: true })
  const manifests = new Map()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const manifestPath = path.join(featuresDir, entry.name, 'feature.json')
    const manifest = await readJson(manifestPath)
    manifests.set(manifest.name, {
      dir: path.join(featuresDir, entry.name),
      manifest,
    })
  }

  return manifests
}

function resolveFeatureOrder(featureName, manifests) {
  const resolved = []
  const visiting = new Set()
  const visited = new Set()

  function visit(name) {
    const entry = manifests.get(name)
    if (!entry) {
      fail(`unknown feature '${name}'`)
    }

    if (visiting.has(name)) {
      fail(`cyclic feature dependency involving '${name}'`)
    }

    if (visited.has(name)) return

    visiting.add(name)
    for (const dependency of entry.manifest.dependsOn ?? []) {
      visit(dependency)
    }
    visiting.delete(name)

    visited.add(name)
    resolved.push(entry)
  }

  visit(featureName)
  return resolved
}

async function loadState(targetDir) {
  const statePath = path.join(targetDir, '.tauri-creator.json')
  if (!(await pathExists(statePath))) {
    fail(`${targetDir} is missing .tauri-creator.json; create it with create-app first`)
  }

  return readJson(statePath)
}

async function copyFeatureFiles(featureEntry, targetDir) {
  const sourceDir = path.join(featureEntry.dir, 'files')
  if (!(await pathExists(sourceDir))) {
    fail(`feature '${featureEntry.manifest.name}' has no files/ directory`)
  }

  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  })

  for (const relativePath of featureEntry.manifest.files ?? []) {
    const targetPath = path.join(targetDir, relativePath)
    if (!(await pathExists(targetPath))) {
      fail(`feature '${featureEntry.manifest.name}' did not create declared path '${relativePath}'`)
    }
  }
}

async function listFiles(dir, prefix = '') {
  if (!(await pathExists(dir))) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name)
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }

  return files.sort()
}

async function assertFeatureFilesCanBeCopied(featureEntry, targetDir) {
  const sourceDir = path.join(featureEntry.dir, 'files')
  const files = await listFiles(sourceDir)

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file)
    const targetPath = path.join(targetDir, file)
    if (!(await pathExists(targetPath))) continue
    if (await pathExists(path.join(baseDir, file))) continue

    const source = await readFile(sourcePath)
    const target = await readFile(targetPath)
    if (!source.equals(target)) {
      fail(`feature '${featureEntry.manifest.name}' would overwrite existing file '${file}'`)
    }
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeJsonArray(base, patch) {
  const arraysContainObjects =
    base.every(isPlainObject) && patch.every(isPlainObject)

  if (!arraysContainObjects) {
    return [...new Set([...base, ...patch])]
  }

  const merged = base.map((item) => ({ ...item }))

  for (const patchItem of patch) {
    const matchIndex =
      typeof patchItem.label === 'string'
        ? merged.findIndex((item) => item.label === patchItem.label)
        : base.length === 1 && patch.length === 1
          ? 0
          : -1

    if (matchIndex === -1) {
      merged.push(patchItem)
    } else {
      merged[matchIndex] = mergeJsonValue(merged[matchIndex], patchItem)
    }
  }

  return merged
}

function mergeJsonValue(base, patch) {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return mergeJsonArray(base, patch)
  }

  if (
    isPlainObject(base) &&
    isPlainObject(patch)
  ) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = key in merged ? mergeJsonValue(merged[key], value) : value
    }
    return merged
  }

  return patch
}

async function listJsonFiles(dir, prefix = '') {
  if (!(await pathExists(dir))) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name)
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath, relativePath))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(relativePath)
    }
  }

  return files.sort()
}

async function mergeJsonPatches(featureEntry, targetDir) {
  const jsonDir = path.join(featureEntry.dir, 'json')
  const patchFiles = await listJsonFiles(jsonDir)

  for (const relativePath of patchFiles) {
    const patchPath = path.join(jsonDir, relativePath)
    const targetPath = path.join(targetDir, relativePath)
    const patch = await readJson(patchPath)
    const base = (await pathExists(targetPath)) ? await readJson(targetPath) : {}
    await writeJson(targetPath, mergeJsonValue(base, patch))
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeCargoDependencyPatch(patch) {
  const structuredKeys = new Set(['dependencies', 'targetDependencies', 'restoreDependencies'])
  const isStructured = Object.keys(patch).some((key) => structuredKeys.has(key))

  if (!isStructured) {
    return {
      dependencies: patch,
      targetDependencies: {},
      restoreDependencies: {},
    }
  }

  return {
    dependencies: patch.dependencies ?? {},
    targetDependencies: patch.targetDependencies ?? {},
    restoreDependencies: patch.restoreDependencies ?? {},
  }
}

function findTomlSection(lines, sectionHeader) {
  const sectionStartIndex = lines.findIndex((line) => line.trim() === sectionHeader)
  if (sectionStartIndex === -1) return null

  let sectionEndIndex = lines.length
  for (let index = sectionStartIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index])) {
      sectionEndIndex = index
      break
    }
  }

  return { sectionStartIndex, sectionEndIndex }
}

function mergeCargoDependencyLinesIntoSection(cargoToml, sectionHeader, dependencies) {
  const entries = Object.entries(dependencies)
  if (entries.length === 0) return cargoToml

  const lines = cargoToml.split('\n')

  let section = findTomlSection(lines, sectionHeader)
  if (!section) {
    if (sectionHeader === '[dependencies]') {
      fail('src-tauri/Cargo.toml is missing a [dependencies] section')
    }

    if (lines.at(-1) !== '') {
      lines.push('')
    }
    lines.push(sectionHeader)
    section = {
      sectionStartIndex: lines.length - 1,
      sectionEndIndex: lines.length,
    }
  }

  for (const [dependencyName, dependencySpec] of entries) {
    const dependencyLine = `${dependencyName} = ${dependencySpec}`
    const dependencyPattern = new RegExp(`^\\s*${escapeRegExp(dependencyName)}\\s*=`)
    let updated = false

    for (let index = section.sectionStartIndex + 1; index < section.sectionEndIndex; index += 1) {
      if (dependencyPattern.test(lines[index])) {
        lines[index] = dependencyLine
        updated = true
        break
      }
    }

    if (!updated) {
      lines.splice(section.sectionEndIndex, 0, dependencyLine)
      section.sectionEndIndex += 1
    }
  }

  return lines.join('\n')
}

function mergeCargoDependencyLines(cargoToml, dependencies) {
  return mergeCargoDependencyLinesIntoSection(cargoToml, '[dependencies]', dependencies)
}

function renderTargetDependencyHeader(target) {
  return `[target.'${target}'.dependencies]`
}

function mergeCargoTargetDependencyLines(cargoToml, targetDependencies) {
  let updated = cargoToml

  for (const [target, dependencies] of Object.entries(targetDependencies)) {
    updated = mergeCargoDependencyLinesIntoSection(
      updated,
      renderTargetDependencyHeader(target),
      dependencies
    )
  }

  return updated
}

async function mergeCargoDependencies(featureEntry, targetDir) {
  const dependenciesPath = path.join(featureEntry.dir, 'cargo-dependencies.json')
  if (!(await pathExists(dependenciesPath))) return

  const dependencyPatch = await readJson(dependenciesPath)
  if (!dependencyPatch || Array.isArray(dependencyPatch) || typeof dependencyPatch !== 'object') {
    fail(`${dependenciesPath}: expected an object`)
  }
  const { dependencies, targetDependencies } = normalizeCargoDependencyPatch(dependencyPatch)

  const cargoPath = path.join(targetDir, 'src-tauri', 'Cargo.toml')
  if (!(await pathExists(cargoPath))) {
    fail(`Cargo manifest does not exist: ${path.relative(targetDir, cargoPath)}`)
  }

  const cargoToml = await readFile(cargoPath, 'utf8')
  const updated = mergeCargoTargetDependencyLines(
    mergeCargoDependencyLines(cargoToml, dependencies),
    targetDependencies
  )
  if (updated !== cargoToml) {
    await writeFile(cargoPath, updated)
  }
}

function markerComment(marker, blockId, boundary) {
  if (marker.trim().startsWith('{/*')) {
    return `{/* TAURI_CREATOR:FEATURE_${boundary} ${blockId} */}`
  }

  if (marker.trim().startsWith('<!--')) {
    return `<!-- TAURI_CREATOR:FEATURE_${boundary} ${blockId} -->`
  }

  return `// TAURI_CREATOR:FEATURE_${boundary} ${blockId}`
}

function isNamedImportOperation(operation) {
  return operation.kind === 'named-import'
}

function normalizeNamedImportNames(names) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort()
}

function renderNamedImport(moduleName, names) {
  return `import { ${names.join(', ')} } from '${moduleName}'`
}

function mergeNamedImport(source, marker, moduleName, names) {
  const normalizedNames = normalizeNamedImportNames(names)
  const importPattern = new RegExp(
    `import \\{([^}]*)\\} from ['"]${escapeRegExp(moduleName)}['"]`
  )
  const match = source.match(importPattern)

  if (match) {
    const existingNames = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const mergedNames = normalizeNamedImportNames([...existingNames, ...normalizedNames])
    return source.replace(importPattern, renderNamedImport(moduleName, mergedNames))
  }

  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) {
    fail(`marker '${marker}' not found for named import '${moduleName}'`)
  }

  const lineStart = source.lastIndexOf('\n', markerIndex) + 1
  const importLine = `${renderNamedImport(moduleName, normalizedNames)}\n`
  return `${source.slice(0, lineStart)}${importLine}${source.slice(lineStart)}`
}

function validateMarkerOperation(markerPath, operation) {
  const { file, id, insert, kind, marker, module: moduleName, names } = operation

  if (!file || !id || !marker) {
    fail(`${markerPath}: marker operations require file, id, and marker`)
  }

  if (isNamedImportOperation(operation)) {
    if (typeof moduleName !== 'string' || moduleName.length === 0) {
      fail(`${markerPath}: named-import marker operations require module`)
    }
    if (!Array.isArray(names) || names.length === 0 || names.some((name) => typeof name !== 'string' || name.length === 0)) {
      fail(`${markerPath}: named-import marker operations require string names`)
    }
    return
  }

  if (kind !== undefined) {
    fail(`${markerPath}: unsupported marker operation kind '${kind}'`)
  }

  if (!insert) {
    fail(`${markerPath}: marker operations require insert`)
  }
}

async function applyMarkerInsertions(featureEntry, targetDir, state) {
  const markerPath = path.join(featureEntry.dir, 'markers.json')
  if (!(await pathExists(markerPath))) return

  const operations = await readJson(markerPath)
  if (!Array.isArray(operations)) {
    fail(`${markerPath}: expected an array`)
  }

  for (const operation of operations) {
    if (shouldSkipMarkerInsertionForSpecta(operation, state)) continue

    validateMarkerOperation(markerPath, operation)
    const { file, id, insert, marker, module: moduleName, names } = operation

    const targetPath = path.join(targetDir, file)
    if (!(await pathExists(targetPath))) {
      fail(`marker target does not exist: ${file}`)
    }

    const source = await readFile(targetPath, 'utf8')
    if (isNamedImportOperation(operation)) {
      const updated = mergeNamedImport(source, marker, moduleName, names)
      if (updated !== source) {
        await writeFile(targetPath, updated)
      }
      continue
    }

    const blockId = `${featureEntry.manifest.name}:${id}`
    const start = markerComment(marker, blockId, 'START')
    const end = markerComment(marker, blockId, 'END')

    if (source.includes(`${start}\n`) || source.includes(`${start} `)) continue

    const markerIndex = source.indexOf(marker)
    if (markerIndex === -1) {
      fail(`marker '${marker}' not found in ${file}`)
    }

    const lineStart = source.lastIndexOf('\n', markerIndex) + 1
    const lineEnd = source.indexOf('\n', markerIndex)
    const markerLine = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd)
    const indent = markerLine.match(/^\s*/)?.[0] ?? ''
    const block = `${indent}${start}\n${insert}\n${indent}${end}\n`
    const updated = `${source.slice(0, lineStart)}${block}${source.slice(lineStart)}`

    await writeFile(targetPath, updated)
  }
}

function shouldSkipMarkerInsertionForSpecta(operation, state) {
  return (
    state.enabledFeatures?.includes('specta-bindings') &&
    operation.file === 'src-tauri/src/lib.rs' &&
    operation.marker.includes('TAURI_CREATOR:TAURI_COMMANDS')
  )
}

async function preflightMarkerInsertions(featureEntry, targetDir, state) {
  const markerPath = path.join(featureEntry.dir, 'markers.json')
  if (!(await pathExists(markerPath))) return

  const operations = await readJson(markerPath)
  if (!Array.isArray(operations)) {
    fail(`${markerPath}: expected an array`)
  }

  for (const operation of operations) {
    if (shouldSkipMarkerInsertionForSpecta(operation, state)) continue

    validateMarkerOperation(markerPath, operation)
    const { file, id, marker } = operation

    const targetPath = path.join(targetDir, file)
    if (!(await pathExists(targetPath))) {
      fail(`marker target does not exist: ${file}`)
    }

    const source = await readFile(targetPath, 'utf8')
    if (isNamedImportOperation(operation)) {
      if (!source.includes(marker) && !source.includes(` from '${operation.module}'`) && !source.includes(` from "${operation.module}"`)) {
        fail(`marker '${marker}' not found in ${file}`)
      }
      continue
    }

    const blockId = `${featureEntry.manifest.name}:${id}`
    const start = markerComment(marker, blockId, 'START')
    if (source.includes(`${start}\n`) || source.includes(`${start} `)) continue

    if (!source.includes(marker)) {
      fail(`marker '${marker}' not found in ${file}`)
    }
  }
}

async function mergeCapabilities(featureEntry, targetDir) {
  const permissions = featureEntry.manifest.capabilities ?? []
  if (permissions.length === 0) return

  const capabilityPath = path.join(targetDir, 'src-tauri', 'capabilities', 'default.json')
  if (!(await pathExists(capabilityPath))) {
    fail(`default capability file does not exist: ${path.relative(targetDir, capabilityPath)}`)
  }

  const capability = await readJson(capabilityPath)
  const existingPermissions = Array.isArray(capability.permissions)
    ? capability.permissions
    : []

  capability.permissions = [...new Set([...existingPermissions, ...permissions])]
  await writeJson(capabilityPath, capability)
}

function formatFeatureList(featureNames) {
  return featureNames.length === 0 ? 'none' : featureNames.join(', ')
}

async function applyFeature(featureEntry, targetDir, state, manifests) {
  const featureName = featureEntry.manifest.name

  if (state.enabledFeatures.includes(featureName)) {
    return false
  }

  await assertFeatureFilesCanBeCopied(featureEntry, targetDir)
  await preflightMarkerInsertions(featureEntry, targetDir, state)

  await copyFeatureFiles(featureEntry, targetDir)
  await mergeJsonPatches(featureEntry, targetDir)
  await mergeCargoDependencies(featureEntry, targetDir)
  await mergeCapabilities(featureEntry, targetDir)
  await applyMarkerInsertions(featureEntry, targetDir, state)

  state.enabledFeatures = [...new Set([...state.enabledFeatures, featureName])]
  await writeJson(path.join(targetDir, '.tauri-creator.json'), state)
  await writeFile(path.join(targetDir, 'PROJECT_MAP.md'), renderProjectMap(state, manifests))

  return true
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  if (!args.target) fail('missing required --target')
  if (!args.feature) fail('missing required --feature')

  const targetDir = path.resolve(args.target)
  if (!(await pathExists(targetDir))) {
    fail(`target directory does not exist: ${targetDir}`)
  }

  const manifests = await loadFeatureManifests()
  const state = await loadState(targetDir)
  state.enabledFeatures = Array.isArray(state.enabledFeatures) ? state.enabledFeatures : []

  const features = resolveFeatureOrder(args.feature, manifests)
  const applied = []

  for (const featureEntry of features) {
    if (!state.enabledFeatures.includes(featureEntry.manifest.name)) {
      await assertFeatureFilesCanBeCopied(featureEntry, targetDir)
      await preflightMarkerInsertions(featureEntry, targetDir, state)
    }
  }

  const planned = features
    .map((featureEntry) => featureEntry.manifest.name)
    .filter((featureName) => !state.enabledFeatures.includes(featureName))

  if (args.dryRun) {
    console.log(`Dry run: would apply features: ${formatFeatureList(planned)}`)
    console.log(`Target: ${targetDir}`)
    return
  }

  for (const featureEntry of features) {
    if (await applyFeature(featureEntry, targetDir, state, manifests)) {
      applied.push(featureEntry.manifest.name)
    }
  }

  await syncSpectaBindings(targetDir, state, manifests)

  console.log(`Target: ${targetDir}`)
  console.log(`Requested feature: ${args.feature}`)
  console.log(`Applied features: ${formatFeatureList(applied)}`)
}

await main()
