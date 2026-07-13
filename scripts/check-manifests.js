import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseDir = path.join(root, 'base')
const featuresDir = path.join(root, 'features')
const recipesDir = path.join(root, 'recipes')
const wizardCategories = ['Desktop', 'Product', 'Data', 'Delivery']

const requiredManifestFields = [
  'name',
  'description',
  'stage',
  'dependsOn',
  'conflictsWith',
  'npmDependencies',
  'cargoDependencies',
  'files',
  'tauriCommands',
  'spectaExports',
  'capabilities',
  'qualityChecks',
  'removeHints',
  'wizard',
]

function fail(errors) {
  console.error('Manifest validation failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${error.message})`)
  }
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

function arrayField(manifest, field) {
  return Array.isArray(manifest[field]) ? manifest[field] : []
}

function validateManifestShape(manifestPath, manifest) {
  const errors = []
  const stringFields = ['name', 'description', 'stage']
  const arrayFields = [
    'dependsOn',
    'conflictsWith',
    'npmDependencies',
    'cargoDependencies',
    'files',
    'tauriCommands',
    'capabilities',
    'qualityChecks',
    'removeHints',
  ]

  for (const field of stringFields) {
    if (field in manifest && typeof manifest[field] !== 'string') {
      errors.push(`${manifestPath}: '${field}' must be a string`)
    }
  }

  if (typeof manifest.stage === 'string' && !/^v\d+$/.test(manifest.stage)) {
    errors.push(`${manifestPath}: stage '${manifest.stage}' must look like 'v1'`)
  }

  for (const field of arrayFields) {
    if (field in manifest && !Array.isArray(manifest[field])) {
      errors.push(`${manifestPath}: '${field}' must be an array`)
      continue
    }

    for (const value of arrayField(manifest, field)) {
      if (typeof value !== 'string') {
        errors.push(`${manifestPath}: '${field}' values must be strings`)
      }
    }
  }

  if ('wizard' in manifest) {
    const wizard = manifest.wizard
    if (!wizard || Array.isArray(wizard) || typeof wizard !== 'object') {
      errors.push(`${manifestPath}: 'wizard' must be an object`)
    } else if (typeof wizard.visible !== 'boolean') {
      errors.push(`${manifestPath}: 'wizard.visible' must be a boolean`)
    } else if (wizard.visible) {
      if (typeof wizard.label !== 'string' || wizard.label.trim().length === 0) {
        errors.push(
          `${manifestPath}: visible wizard feature requires non-empty 'wizard.label'`
        )
      }
      if (typeof wizard.category !== 'string' || wizard.category.trim().length === 0) {
        errors.push(
          `${manifestPath}: visible wizard feature requires non-empty 'wizard.category'`
        )
      } else if (!wizardCategories.includes(wizard.category)) {
        errors.push(
          `${manifestPath}: 'wizard.category' must be one of: ${wizardCategories.join(', ')}`
        )
      }
    } else if (Object.keys(wizard).some((field) => field !== 'visible')) {
      errors.push(`${manifestPath}: hidden wizard metadata may only contain 'visible'`)
    }
  }

  return errors
}

async function validateSpectaExports(featureDir, manifestPath, manifest) {
  const errors = []
  const exports = manifest.spectaExports

  if (!Array.isArray(exports)) {
    errors.push(`${manifestPath}: 'spectaExports' must be an array`)
    return errors
  }

  const exportedCommands = new Set()

  for (const [index, exportGroup] of exports.entries()) {
    if (!exportGroup || Array.isArray(exportGroup) || typeof exportGroup !== 'object') {
      errors.push(`${manifestPath}: spectaExports[${index}] must be an object`)
      continue
    }

    if (typeof exportGroup.module !== 'string' || exportGroup.module.length === 0) {
      errors.push(`${manifestPath}: spectaExports[${index}].module must be a string`)
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*(::[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(exportGroup.module)) {
      errors.push(`${manifestPath}: spectaExports[${index}].module must be a Rust module path`)
    }

    if (!Array.isArray(exportGroup.commands)) {
      errors.push(`${manifestPath}: spectaExports[${index}].commands must be an array`)
    } else {
      for (const command of exportGroup.commands) {
        if (typeof command !== 'string' || command.length === 0) {
          errors.push(`${manifestPath}: spectaExports[${index}].commands values must be strings`)
          continue
        }

        exportedCommands.add(command)
        if (!arrayField(manifest, 'tauriCommands').includes(command)) {
          errors.push(
            `${manifestPath}: spectaExports[${index}] references unknown tauri command '${command}'`
          )
        }
      }
    }

    if (!Array.isArray(exportGroup.files)) {
      errors.push(`${manifestPath}: spectaExports[${index}].files must be an array`)
    } else {
      for (const file of exportGroup.files) {
        if (typeof file !== 'string' || file.length === 0) {
          errors.push(`${manifestPath}: spectaExports[${index}].files values must be strings`)
          continue
        }

        if (!(await pathExists(path.join(featureDir, 'files', file)))) {
          errors.push(`${manifestPath}: spectaExports[${index}] references missing file '${file}'`)
        }
      }
    }

    if (!Array.isArray(exportGroup.types)) {
      errors.push(`${manifestPath}: spectaExports[${index}].types must be an array`)
    } else {
      for (const typeName of exportGroup.types) {
        if (typeof typeName !== 'string' || typeName.length === 0) {
          errors.push(`${manifestPath}: spectaExports[${index}].types values must be strings`)
        }
      }
    }
  }

  for (const command of arrayField(manifest, 'tauriCommands')) {
    if (!exportedCommands.has(command)) {
      errors.push(`${manifestPath}: tauri command '${command}' is missing from spectaExports`)
    }
  }

  return errors
}

async function validateDeclaredFiles(featureDir, manifestPath, manifest) {
  const errors = []
  const files = arrayField(manifest, 'files')

  for (const declaredFile of files) {
    const sourcePath = path.join(featureDir, 'files', declaredFile)
    if (!(await pathExists(sourcePath))) {
      errors.push(`${manifestPath}: declares missing file '${declaredFile}'`)
    }
  }

  const declaredDocs = files.filter(
    (file) => file.startsWith('docs/features/') && file.endsWith('.md')
  )
  const docsRoot = path.join(featureDir, 'files', 'docs', 'features')
  if (await pathExists(docsRoot)) {
    const docsEntries = await readdir(docsRoot, { withFileTypes: true })
    const docsFiles = docsEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `docs/features/${entry.name}`)

    for (const docsFile of docsFiles) {
      if (!declaredDocs.includes(docsFile)) {
        errors.push(`${manifestPath}: docs file '${docsFile}' must be declared in files`)
      }
    }
  }

  return errors
}

async function validateMarkerOperations(featureDir, manifestPath) {
  const markerPath = path.join(featureDir, 'markers.json')
  if (!(await pathExists(markerPath))) return []

  const errors = []
  let operations
  try {
    operations = await readJson(markerPath)
  } catch (error) {
    return [error.message]
  }

  if (!Array.isArray(operations)) {
    return [`${markerPath}: expected an array`]
  }

  const ids = new Set()

  for (const operation of operations) {
    if (!operation || Array.isArray(operation) || typeof operation !== 'object') {
      errors.push(`${markerPath}: marker operations must be objects`)
      continue
    }

    const { file, id, kind, marker } = operation
    for (const field of ['file', 'id', 'marker']) {
      if (typeof operation[field] !== 'string' || operation[field].length === 0) {
        errors.push(`${markerPath}: marker operation requires string '${field}'`)
      }
    }

    if (kind === 'named-import') {
      if (typeof operation.module !== 'string' || operation.module.length === 0) {
        errors.push(`${markerPath}: named-import operation requires string 'module'`)
      }
      if (!Array.isArray(operation.names) || operation.names.length === 0) {
        errors.push(`${markerPath}: named-import operation requires non-empty 'names' array`)
      } else {
        for (const name of operation.names) {
          if (typeof name !== 'string' || name.length === 0) {
            errors.push(`${markerPath}: named-import operation names must be strings`)
          }
        }
      }
    } else {
      if (kind !== undefined) {
        errors.push(`${markerPath}: unsupported marker operation kind '${kind}'`)
      }
      if (typeof operation.insert !== 'string' || operation.insert.length === 0) {
        errors.push(`${markerPath}: marker operation requires string 'insert'`)
      }
    }

    if (typeof id === 'string') {
      if (ids.has(id)) {
        errors.push(`${markerPath}: duplicate marker operation id '${id}'`)
      }
      ids.add(id)
    }

    if (typeof file !== 'string' || typeof marker !== 'string') continue

    const baseTargetPath = path.join(baseDir, file)
    if (await pathExists(baseTargetPath)) {
      const source = await readFile(baseTargetPath, 'utf8')
      if (!source.includes(marker)) {
        errors.push(`${markerPath}: marker '${marker}' not found in base file '${file}'`)
      }
    }
  }

  return errors
}

async function loadFeatures() {
  const entries = await readdir(featuresDir, { withFileTypes: true })
  const featureNames = new Set()
  const manifests = []
  const errors = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const manifestPath = path.join(featuresDir, entry.name, 'feature.json')
    let manifest
    try {
      manifest = await readJson(manifestPath)
    } catch (error) {
      errors.push(error.message)
      continue
    }

    for (const field of requiredManifestFields) {
      if (!(field in manifest)) {
        errors.push(`${manifestPath}: missing required field '${field}'`)
      }
    }

    errors.push(...validateManifestShape(manifestPath, manifest))
    errors.push(...await validateSpectaExports(
      path.join(featuresDir, entry.name),
      manifestPath,
      manifest
    ))

    if (manifest.name !== entry.name) {
      errors.push(
        `${manifestPath}: name '${manifest.name}' must match directory '${entry.name}'`
      )
    }

    featureNames.add(manifest.name)
    errors.push(...await validateDeclaredFiles(
      path.join(featuresDir, entry.name),
      manifestPath,
      manifest
    ))
    errors.push(...await validateMarkerOperations(
      path.join(featuresDir, entry.name),
      manifestPath
    ))

    manifests.push({ path: manifestPath, manifest })
  }

  const visibleLabels = new Map()
  for (const { path: manifestPath, manifest } of manifests) {
    const wizard = manifest.wizard
    if (!wizard?.visible || typeof wizard.label !== 'string' || !wizard.label.trim()) continue

    const normalizedLabel = wizard.label.trim().toLowerCase()
    const existing = visibleLabels.get(normalizedLabel)
    if (existing) {
      errors.push(
        `${manifestPath}: duplicate visible wizard label '${wizard.label.trim()}' (already used by '${existing}')`
      )
    } else {
      visibleLabels.set(normalizedLabel, manifest.name)
    }
  }

  for (const { path: manifestPath, manifest } of manifests) {
    for (const dependency of arrayField(manifest, 'dependsOn')) {
      if (dependency === manifest.name) {
        errors.push(`${manifestPath}: dependsOn cannot reference itself`)
      }
    }

    for (const conflict of arrayField(manifest, 'conflictsWith')) {
      if (conflict === manifest.name) {
        errors.push(`${manifestPath}: conflictsWith cannot reference itself`)
      }
    }

    for (const dependency of arrayField(manifest, 'dependsOn')) {
      if (!featureNames.has(dependency)) {
        errors.push(
          `${manifestPath}: dependsOn references unknown feature '${dependency}'`
        )
      }
    }

    for (const conflict of arrayField(manifest, 'conflictsWith')) {
      if (!featureNames.has(conflict)) {
        errors.push(
          `${manifestPath}: conflictsWith references unknown feature '${conflict}'`
        )
      }
    }
  }

  errors.push(...validateDependencyCycles(manifests))

  return { featureNames, manifests, errors }
}

function validateDependencyCycles(manifests) {
  const errors = []
  const manifestMap = new Map(manifests.map(({ manifest }) => [manifest.name, manifest]))
  const visiting = new Set()
  const visited = new Set()

  function visit(featureName, stack = []) {
    if (visiting.has(featureName)) {
      errors.push(`feature dependency cycle detected: ${[...stack, featureName].join(' -> ')}`)
      return
    }

    if (visited.has(featureName)) return

    const manifest = manifestMap.get(featureName)
    if (!manifest) return

    visiting.add(featureName)
    for (const dependency of arrayField(manifest, 'dependsOn')) {
      visit(dependency, [...stack, featureName])
    }
    visiting.delete(featureName)
    visited.add(featureName)
  }

  for (const featureName of manifestMap.keys()) {
    visit(featureName)
  }

  return errors
}

async function validateRecipes(featureNames) {
  const entries = await readdir(recipesDir, { withFileTypes: true })
  const errors = []
  const recipeNames = new Set()

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue

    const recipePath = path.join(recipesDir, entry.name)
    const expectedName = path.basename(entry.name, '.json')
    let recipe
    try {
      recipe = await readJson(recipePath)
    } catch (error) {
      errors.push(error.message)
      continue
    }

    if (typeof recipe.name !== 'string' || recipe.name.trim().length === 0) {
      errors.push(`${recipePath}: missing required field 'name'`)
    } else {
      if (recipe.name !== expectedName) {
        errors.push(
          `${recipePath}: name '${recipe.name}' must match filename '${expectedName}'`
        )
      }
      if (recipeNames.has(recipe.name)) {
        errors.push(`${recipePath}: duplicate recipe name '${recipe.name}'`)
      } else {
        recipeNames.add(recipe.name)
      }
    }

    if (typeof recipe.description !== 'string' || recipe.description.trim().length === 0) {
      errors.push(`${recipePath}: requires non-empty 'description'`)
    }

    if (!Array.isArray(recipe.features)) {
      errors.push(`${recipePath}: 'features' must be an array`)
      continue
    }

    for (const feature of recipe.features) {
      if (!featureNames.has(feature)) {
        errors.push(`${recipePath}: references unknown feature '${feature}'`)
      }
    }
  }

  return { recipeNames, errors }
}

async function validateReadmeReferences(featureNames, recipeNames) {
  const readmePath = path.join(root, 'README.md')
  if (!(await pathExists(readmePath))) return []

  const readme = await readFile(readmePath, 'utf8')
  const errors = []
  const allowedToolReferences = ['pnpm', 'npm']
  const allowed = new Set([...featureNames, ...recipeNames, ...allowedToolReferences])
  const codeSpanPattern = /`([a-z0-9][a-z0-9-]*)`/g

  for (const match of readme.matchAll(codeSpanPattern)) {
    const reference = match[1]
    if (!allowed.has(reference)) {
      errors.push(`${readmePath}: unknown feature or recipe reference '${reference}'`)
    }
  }

  return errors
}

const { featureNames, errors: featureErrors } = await loadFeatures()
const { recipeNames, errors: recipeErrors } = await validateRecipes(featureNames)
const readmeErrors = await validateReadmeReferences(featureNames, recipeNames)
const errors = [...featureErrors, ...recipeErrors, ...readmeErrors]

if (errors.length > 0) {
  fail(errors)
}

console.log(
  `Manifest validation passed (${featureNames.size} features, ${recipesDir})`
)
