import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProjectMap } from './project-map.js'
import { syncSpectaBindings } from './specta-bindings.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseDir = path.join(root, 'base')
const featuresDir = path.join(root, 'features')

function printUsage() {
  console.log(`Usage: node scripts/remove-feature.js --target <path> --feature <feature-name>

Options:
  --target     Generated app directory.
  --feature    Enabled feature to remove.
  --dry-run    Print planned removal without writing files.
`)
}

function fail(message) {
  console.error(`remove-feature: ${message}`)
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

function mergeJsonValue(base, patch) {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return [...new Set([...base, ...patch])]
  }

  if (
    base &&
    patch &&
    typeof base === 'object' &&
    typeof patch === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = key in merged ? mergeJsonValue(merged[key], value) : value
    }
    return merged
  }

  return patch
}

function jsonValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
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

async function loadState(targetDir) {
  const statePath = path.join(targetDir, '.tauri-creator.json')
  if (!(await pathExists(statePath))) {
    fail(`${targetDir} is missing .tauri-creator.json; create it with create-app first`)
  }

  return readJson(statePath)
}

function assertCanRemove(featureName, state, manifests) {
  const enabledFeatures = state.enabledFeatures ?? []
  if (!enabledFeatures.includes(featureName)) {
    fail(`feature '${featureName}' is not enabled`)
  }

  const dependents = enabledFeatures.filter((enabledFeature) => {
    if (enabledFeature === featureName) return false
    const entry = manifests.get(enabledFeature)
    return entry?.manifest.dependsOn?.includes(featureName)
  })

  if (dependents.length > 0) {
    fail(`cannot remove '${featureName}' because enabled features depend on it: ${dependents.join(', ')}`)
  }
}

async function removeDeclaredFiles(featureEntry, targetDir) {
  for (const relativePath of featureEntry.manifest.files ?? []) {
    await rm(path.join(targetDir, relativePath), {
      recursive: true,
      force: true,
    })
  }
}

async function listFeatureFiles(dir, prefix = '') {
  if (!(await pathExists(dir))) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name)
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listFeatureFiles(fullPath, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }

  return files.sort()
}

async function remainingFeatureProvidesFile(relativePath, remainingFeatures, manifests) {
  for (const featureName of remainingFeatures) {
    const entry = manifests.get(featureName)
    if (!entry) continue

    if (await pathExists(path.join(entry.dir, 'files', relativePath))) {
      return true
    }
  }

  return false
}

async function restoreOverwrittenBaseFiles(featureEntry, targetDir, state, manifests) {
  const sourceDir = path.join(featureEntry.dir, 'files')
  const files = await listFeatureFiles(sourceDir)
  const remainingFeatures = (state.enabledFeatures ?? []).filter(
    (featureName) => featureName !== featureEntry.manifest.name
  )

  for (const relativePath of files) {
    const basePath = path.join(baseDir, relativePath)
    if (!(await pathExists(basePath))) continue
    if (await remainingFeatureProvidesFile(relativePath, remainingFeatures, manifests)) continue

    const targetPath = path.join(targetDir, relativePath)
    const featurePath = path.join(sourceDir, relativePath)
    const featureContent = await readFile(featurePath)
    const shouldRestore =
      !(await pathExists(targetPath)) || (await readFile(targetPath)).equals(featureContent)

    if (!shouldRestore) continue

    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, await readFile(basePath))
  }
}

function removeJsonPatchValue(base, patch, remainingPatch) {
  if (remainingPatch !== undefined && jsonValuesEqual(patch, remainingPatch)) {
    return base
  }

  if (Array.isArray(base) && Array.isArray(patch)) {
    const remainingValues = Array.isArray(remainingPatch) ? remainingPatch : []
    return base.filter((item) => {
      if (remainingValues.some((remainingItem) => jsonValuesEqual(item, remainingItem))) {
        return true
      }

      return !patch.some((patchItem) => jsonValuesEqual(item, patchItem))
    })
  }

  if (
    base &&
    patch &&
    typeof base === 'object' &&
    typeof patch === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const updated = { ...base }
    const remainingObject =
      remainingPatch &&
      typeof remainingPatch === 'object' &&
      !Array.isArray(remainingPatch)
        ? remainingPatch
        : {}

    for (const [key, value] of Object.entries(patch)) {
      if (!(key in updated)) continue

      if (key in remainingObject) {
        updated[key] = removeJsonPatchValue(updated[key], value, remainingObject[key])
      } else if (Array.isArray(updated[key]) && Array.isArray(value)) {
        updated[key] = removeJsonPatchValue(updated[key], value, undefined)
      } else if (jsonValuesEqual(updated[key], value)) {
        delete updated[key]
      } else if (
        updated[key] &&
        value &&
        typeof updated[key] === 'object' &&
        typeof value === 'object' &&
        !Array.isArray(updated[key]) &&
        !Array.isArray(value)
      ) {
        updated[key] = removeJsonPatchValue(updated[key], value, undefined)
      }
    }

    return updated
  }

  if (remainingPatch !== undefined) return base
  return jsonValuesEqual(base, patch) ? undefined : base
}

async function loadJsonPatch(featureEntry, relativePath) {
  const patchPath = path.join(featureEntry.dir, 'json', relativePath)
  if (!(await pathExists(patchPath))) return {}
  return readJson(patchPath)
}

async function loadRemainingJsonPatch(relativePath, remainingFeatures, manifests) {
  let merged = {}

  for (const featureName of remainingFeatures) {
    const entry = manifests.get(featureName)
    if (!entry) continue

    const patch = await loadJsonPatch(entry, relativePath)
    merged = mergeJsonValue(merged, patch)
  }

  return merged
}

async function removeJsonPatches(featureEntry, targetDir, state, manifests) {
  const jsonDir = path.join(featureEntry.dir, 'json')
  const patchFiles = await listJsonFiles(jsonDir)
  if (patchFiles.length === 0) return

  const remainingFeatures = (state.enabledFeatures ?? []).filter(
    (featureName) => featureName !== featureEntry.manifest.name
  )

  for (const relativePath of patchFiles) {
    const targetPath = path.join(targetDir, relativePath)
    if (!(await pathExists(targetPath))) continue

    const patch = await loadJsonPatch(featureEntry, relativePath)
    const remainingPatch = await loadRemainingJsonPatch(relativePath, remainingFeatures, manifests)
    const base = await readJson(targetPath)
    const updated = removeJsonPatchValue(base, patch, remainingPatch)

    if (!jsonValuesEqual(base, updated)) {
      await writeJson(targetPath, updated)
    }
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

function removeMarkerBlock(source, start, end) {
  let startIndex = source.indexOf(`${start}\n`)
  if (startIndex === -1) {
    startIndex = source.indexOf(`${start} `)
  }
  if (startIndex === -1) return source

  let endIndex = source.indexOf(`${end}\n`, startIndex)
  if (endIndex === -1) {
    endIndex = source.indexOf(`${end} `, startIndex)
  }
  if (endIndex === -1) return source

  const blockStart = source.lastIndexOf('\n', startIndex) + 1
  const endLineIndex = source.indexOf('\n', endIndex)
  const blockEnd = endLineIndex === -1 ? source.length : endLineIndex + 1

  return `${source.slice(0, blockStart)}${source.slice(blockEnd)}`
}

async function removeMarkerInsertions(featureEntry, targetDir) {
  const markerPath = path.join(featureEntry.dir, 'markers.json')
  if (!(await pathExists(markerPath))) return

  const operations = await readJson(markerPath)
  if (!Array.isArray(operations)) {
    fail(`${markerPath}: expected an array`)
  }

  for (const operation of operations) {
    const { file, id, marker } = operation
    if (!file || !id || !marker) {
      fail(`${markerPath}: marker operations require file, id, and marker`)
    }

    const targetPath = path.join(targetDir, file)
    if (!(await pathExists(targetPath))) continue

    const blockId = `${featureEntry.manifest.name}:${id}`
    const start = markerComment(marker, blockId, 'START')
    const end = markerComment(marker, blockId, 'END')
    const source = await readFile(targetPath, 'utf8')
    const updated = removeMarkerBlock(source, start, end)

    if (updated !== source) {
      await writeFile(targetPath, updated)
    }
  }
}

async function removeCapabilities(featureEntry, targetDir, state, manifests) {
  const removedPermissions = featureEntry.manifest.capabilities ?? []
  if (removedPermissions.length === 0) return

  const capabilityPath = path.join(targetDir, 'src-tauri', 'capabilities', 'default.json')
  if (!(await pathExists(capabilityPath))) return

  const remainingFeatures = (state.enabledFeatures ?? []).filter(
    (featureName) => featureName !== featureEntry.manifest.name
  )
  const permissionsStillNeeded = new Set()

  for (const featureName of remainingFeatures) {
    const entry = manifests.get(featureName)
    for (const permission of entry?.manifest.capabilities ?? []) {
      permissionsStillNeeded.add(permission)
    }
  }

  const capability = await readJson(capabilityPath)
  const currentPermissions = Array.isArray(capability.permissions)
    ? capability.permissions
    : []

  capability.permissions = currentPermissions.filter((permission) => {
    if (!removedPermissions.includes(permission)) return true
    return permissionsStillNeeded.has(permission)
  })

  await writeJson(capabilityPath, capability)
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
  const section = findTomlSection(lines, sectionHeader)
  if (!section) return cargoToml

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

function restoreCargoDependencyLines(cargoToml, dependencies) {
  return mergeCargoDependencyLinesIntoSection(cargoToml, '[dependencies]', dependencies)
}

function removeCargoDependencyLines(cargoToml, dependencyNames) {
  if (dependencyNames.length === 0) return cargoToml

  const lines = cargoToml.split('\n')
  const dependencyPatterns = dependencyNames.map((dependencyName) => (
    new RegExp(`^\\s*${escapeRegExp(dependencyName)}\\s*=`)
  ))

  const updatedLines = []
  let inDependencySection = false

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index])) {
      const sectionHeader = lines[index].trim()
      inDependencySection =
        sectionHeader === '[dependencies]' || /\.dependencies\]\s*$/.test(sectionHeader)
      updatedLines.push(lines[index])
      continue
    }

    const shouldRemove = inDependencySection && dependencyPatterns.some((pattern) => pattern.test(lines[index]))

    if (!shouldRemove) {
      updatedLines.push(lines[index])
    }
  }

  return updatedLines.join('\n')
}

async function loadCargoDependencyNames(featureEntry) {
  const dependenciesPath = path.join(featureEntry.dir, 'cargo-dependencies.json')
  const dependencyNames = new Set(featureEntry.manifest.cargoDependencies ?? [])

  if (await pathExists(dependenciesPath)) {
    const dependencyPatch = await readJson(dependenciesPath)
    if (!dependencyPatch || Array.isArray(dependencyPatch) || typeof dependencyPatch !== 'object') {
      fail(`${dependenciesPath}: expected an object`)
    }
    const { dependencies, targetDependencies, restoreDependencies } =
      normalizeCargoDependencyPatch(dependencyPatch)
    const restoredDependencyNames = new Set(Object.keys(restoreDependencies))

    for (const dependencyName of Object.keys(dependencies)) {
      if (!restoredDependencyNames.has(dependencyName)) {
        dependencyNames.add(dependencyName)
      }
    }

    for (const dependenciesForTarget of Object.values(targetDependencies)) {
      for (const dependencyName of Object.keys(dependenciesForTarget)) {
        dependencyNames.add(dependencyName)
      }
    }
  }

  return [...dependencyNames]
}

async function loadCargoRestoreDependencies(featureEntry) {
  const dependenciesPath = path.join(featureEntry.dir, 'cargo-dependencies.json')
  if (!(await pathExists(dependenciesPath))) return {}

  const dependencyPatch = await readJson(dependenciesPath)
  if (!dependencyPatch || Array.isArray(dependencyPatch) || typeof dependencyPatch !== 'object') {
    fail(`${dependenciesPath}: expected an object`)
  }

  return normalizeCargoDependencyPatch(dependencyPatch).restoreDependencies
}

async function removeCargoDependencies(featureEntry, targetDir, state, manifests) {
  const removedDependencyNames = await loadCargoDependencyNames(featureEntry)
  if (removedDependencyNames.length === 0) return

  const remainingFeatures = (state.enabledFeatures ?? []).filter(
    (featureName) => featureName !== featureEntry.manifest.name
  )
  const dependenciesStillNeeded = new Set()

  for (const featureName of remainingFeatures) {
    const entry = manifests.get(featureName)
    if (!entry) continue

    for (const dependencyName of await loadCargoDependencyNames(entry)) {
      dependenciesStillNeeded.add(dependencyName)
    }
  }

  const removableDependencies = removedDependencyNames.filter(
    (dependencyName) => !dependenciesStillNeeded.has(dependencyName)
  )
  if (removableDependencies.length === 0) return

  const cargoPath = path.join(targetDir, 'src-tauri', 'Cargo.toml')
  if (!(await pathExists(cargoPath))) return

  const cargoToml = await readFile(cargoPath, 'utf8')
  const restored = restoreCargoDependencyLines(
    cargoToml,
    await loadCargoRestoreDependencies(featureEntry)
  )
  const updated = removeCargoDependencyLines(restored, removableDependencies)
  if (updated !== cargoToml) {
    await writeFile(cargoPath, updated)
  }
}

function formatFeatureList(featureNames) {
  return featureNames.length === 0 ? 'none' : featureNames.join(', ')
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
  const featureEntry = manifests.get(args.feature)
  if (!featureEntry) {
    fail(`unknown feature '${args.feature}'`)
  }

  const state = await loadState(targetDir)
  state.enabledFeatures = Array.isArray(state.enabledFeatures) ? state.enabledFeatures : []

  assertCanRemove(args.feature, state, manifests)

  if (args.dryRun) {
    console.log(`Dry run: would remove feature: ${args.feature}`)
    console.log(`Target: ${targetDir}`)
    console.log(`Declared files: ${formatFeatureList(featureEntry.manifest.files ?? [])}`)
    return
  }

  await removeDeclaredFiles(featureEntry, targetDir)
  await restoreOverwrittenBaseFiles(featureEntry, targetDir, state, manifests)
  await removeJsonPatches(featureEntry, targetDir, state, manifests)
  await removeMarkerInsertions(featureEntry, targetDir)
  await removeCapabilities(featureEntry, targetDir, state, manifests)
  await removeCargoDependencies(featureEntry, targetDir, state, manifests)

  state.enabledFeatures = state.enabledFeatures.filter((featureName) => featureName !== args.feature)
  await writeJson(path.join(targetDir, '.tauri-creator.json'), state)
  await writeFile(path.join(targetDir, 'PROJECT_MAP.md'), renderProjectMap(state, manifests))

  await syncSpectaBindings(targetDir, state, manifests, { cleanupWhenDisabled: true })

  console.log(`Target: ${targetDir}`)
  console.log(`Removed feature: ${args.feature}`)
  console.log(`Enabled features: ${formatFeatureList(state.enabledFeatures)}`)
}

await main()
