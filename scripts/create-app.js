import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProjectMap } from './project-map.js'
import {
  parseCommaList,
  PromptCancelledError,
  promptForCreateAppWizard,
} from './prompts.js'
import {
  defaultPackageManager,
  normalizePackageManager,
  packageManagerInstallCommand,
  packageManagerSetupCommand,
  packageManagerSpec,
  supportedPackageManagers,
} from './package-managers.js'
import { replaceTemplatesInTree } from './template-renderer.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseDir = path.join(root, 'base')
const recipesDir = path.join(root, 'recipes')
const featuresDir = path.join(root, 'features')
const applyFeatureScript = path.join(root, 'scripts', 'apply-feature.js')

function printUsage() {
  console.log(`Usage: node scripts/create-app.js
       node scripts/create-app.js --advanced
       node scripts/create-app.js --name <app-name> --target <path> --recipe <recipe>
       node scripts/create-app.js --name <app-name> --target <path> --features <feature-a,feature-b>

Options:
  --advanced           Compatibility alias for the interactive template wizard.
  --name               App package name. Example: demo-tool
  --target             Output directory. Must be empty or not exist.
  --recipe             Recipe preset from recipes/*.json. Example: starter
  --features           Comma-separated features. Without --recipe, this uses feature integration mode.
  --sidebar            Desktop layout sidebar: left, right, or both. Defaults to both.
  --package-manager    Generated app package manager: npm or pnpm. Defaults to npm.
  --author             Cargo author. Defaults to "you".
  --bundle-prefix      Bundle identifier prefix. Defaults to com.local.
  --window-width       Main window width. Defaults to 1000.
  --window-height      Main window height. Defaults to 700.
  --license            Package license. Defaults to UNLICENSED.
`)
}

function fail(message) {
  console.error(`create-app: ${message}`)
  process.exit(1)
}

class GenerationInterruptedError extends Error {
  constructor(signal) {
    super(`generation interrupted by ${signal}; temporary files were removed`)
    this.name = 'GenerationInterruptedError'
    this.signal = signal
  }
}

function createGenerationInterruptGuard() {
  let interruptedSignal = null
  const handleSigint = () => { interruptedSignal ??= 'SIGINT' }
  const handleSigterm = () => { interruptedSignal ??= 'SIGTERM' }
  process.on('SIGINT', handleSigint)
  process.on('SIGTERM', handleSigterm)

  return {
    throwIfInterrupted() {
      if (interruptedSignal) throw new GenerationInterruptedError(interruptedSignal)
    },
    close() {
      process.off('SIGINT', handleSigint)
      process.off('SIGTERM', handleSigterm)
    },
  }
}

function parseArgs(argv) {
  const args = {}
  const booleanFlags = new Set(['advanced'])

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }

    if (!arg.startsWith('--')) {
      fail(`unexpected positional argument '${arg}'`)
    }

    const key = arg.slice(2)
    if (booleanFlags.has(key)) {
      args[key] = true
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      fail(`missing value for --${key}`)
    }

    args[key] = value
    index += 1
  }

  return args
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

async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue

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

async function loadFeatureManifests() {
  const entries = await readdir(featuresDir, { withFileTypes: true })
  const manifests = new Map()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const manifestPath = path.join(featuresDir, entry.name, 'feature.json')
    const manifest = await readJson(manifestPath)
    manifests.set(manifest.name, manifest)
  }

  return manifests
}

async function loadRecipe(recipeName) {
  const recipePath = path.join(recipesDir, `${recipeName}.json`)
  if (!(await pathExists(recipePath))) {
    throw new Error(`unknown recipe '${recipeName}'`)
  }

  const recipe = await readJson(recipePath)
  if (!Array.isArray(recipe.features)) {
    throw new Error(`${recipePath}: 'features' must be an array`)
  }

  return recipe
}

async function listRecipeNames() {
  const entries = await readdir(recipesDir, { withFileTypes: true })
  const preferredOrder = new Map([
    ['minimal', 0],
    ['starter', 1],
    ['full', 2],
  ])
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.basename(entry.name, '.json'))
    .sort((left, right) => {
      const leftOrder = preferredOrder.get(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = preferredOrder.get(right) ?? Number.MAX_SAFE_INTEGER
      return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder
    })
}

function resolveFeatureOrder(selection, featureManifests) {
  const resolved = []
  const visiting = new Set()
  const visited = new Set()

  function visit(featureName, parent = selection.name) {
    const manifest = featureManifests.get(featureName)
    if (!manifest) {
      throw new Error(`selection '${parent}' references unknown feature '${featureName}'`)
    }

    if (visiting.has(featureName)) {
      throw new Error(`cyclic feature dependency involving '${featureName}'`)
    }

    if (visited.has(featureName)) return

    visiting.add(featureName)
    for (const dependency of manifest.dependsOn ?? []) {
      visit(dependency, featureName)
    }
    visiting.delete(featureName)

    visited.add(featureName)
    resolved.push(manifest)
  }

  for (const featureName of selection.features) {
    visit(featureName)
  }

  for (const feature of resolved) {
    for (const conflict of feature.conflictsWith ?? []) {
      if (visited.has(conflict)) {
        throw new Error(
          `feature '${feature.name}' conflicts with '${conflict}' in selection '${selection.name}'`
        )
      }
    }
  }

  return resolved
}

async function listRecipeCatalog(featureManifests) {
  const recipes = []
  for (const recipeName of await listRecipeNames()) {
    const recipe = await loadRecipe(recipeName)
    recipes.push({
      ...recipe,
      resolvedFeatures: resolveFeatureOrder(recipe, featureManifests).map(
        (feature) => feature.name
      ),
    })
  }
  return recipes
}

function listWizardFeatures(featureManifests) {
  const categoryOrder = new Map([
    ['Desktop', 0],
    ['Product', 1],
    ['Data', 2],
    ['Delivery', 3],
  ])

  return [...featureManifests.values()]
    .filter((manifest) => manifest.wizard?.visible)
    .map((manifest) => ({
      name: manifest.name,
      label: manifest.wizard.label,
      category: manifest.wizard.category,
      description: manifest.description,
    }))
    .sort((left, right) => {
      const categoryDifference =
        (categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER)
      return categoryDifference === 0
        ? left.label.localeCompare(right.label)
        : categoryDifference
    })
}

async function validateTargetDirectory(value) {
  const targetDir = path.resolve(String(value).trim())
  if (!(await pathExists(targetDir))) return targetDir

  const targetStat = await stat(targetDir)
  if (!targetStat.isDirectory()) {
    throw new Error(`Target path must be an empty directory: ${targetDir}`)
  }

  const entries = await readdir(targetDir)
  if (entries.length > 0) {
    throw new Error(`Target directory must be empty: ${targetDir}`)
  }
  return targetDir
}

async function createSelectionPreview(recipeName, optionalFeatures, featureManifests) {
  const recipe = await loadRecipe(recipeName)
  const recipeFeatures = resolveFeatureOrder(recipe, featureManifests).map(
    (feature) => feature.name
  )
  const selection = {
    name: recipe.name,
    features: [...recipe.features, ...optionalFeatures],
  }
  const resolvedFeatures = resolveFeatureOrder(selection, featureManifests).map(
    (feature) => feature.name
  )
  const recipeFeatureSet = new Set(recipeFeatures)
  const optionalFeatureSet = new Set(optionalFeatures)

  return {
    recipeFeatures,
    requestedFeatures: optionalFeatures,
    automaticFeatures: resolvedFeatures.filter(
      (feature) => !recipeFeatureSet.has(feature) && !optionalFeatureSet.has(feature)
    ),
    resolvedFeatures,
  }
}

function toPackageName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/_+/g, '-')
}

function toTitle(name) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function normalizeTomlString(value, optionName, fallback) {
  const normalized = String(value ?? fallback).trim()
  if (!normalized) return fallback
  if (/[\u0000-\u001f\u007f"\\]/.test(normalized)) {
    throw new Error(
      `${optionName} cannot contain control characters, quotes, or backslashes`
    )
  }
  return normalized
}

function normalizeLicense(value, optionName = '--license') {
  return normalizeTomlString(value, optionName, 'UNLICENSED')
}

function normalizeBundleIdentifierPrefix(value, optionName = '--bundle-prefix') {
  const prefix = String(value ?? 'com.local')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')

  if (!prefix) return 'com.local'

  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(prefix)) {
    throw new Error(`${optionName} must use reverse-DNS segments such as com.example`)
  }

  return prefix
}

function normalizePackageManagerOption(value) {
  return normalizePackageManager(value)
}

function normalizeWindowDimension(value, optionName, fallback) {
  const raw = String(value ?? fallback).trim()
  const parsed = Number.parseInt(raw, 10)

  if (!Number.isInteger(parsed) || String(parsed) !== raw || parsed < 320 || parsed > 10000) {
    throw new Error(`${optionName} must be an integer between 320 and 10000`)
  }

  return String(parsed)
}

function normalizeAppName(rawName, optionName = '--name') {
  const appName = toPackageName(rawName)
  if (!appName) {
    throw new Error(`${optionName} must contain at least one letter or number`)
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(appName)) {
    throw new Error(`${optionName} normalizes to invalid npm package name '${appName}'`)
  }

  return appName
}

function buildTemplateValues(rawName, options = {}) {
  const appName = normalizeAppName(rawName)

  const cargoCrateName = appName.replaceAll('-', '_')
  const title = toTitle(appName)
  const author = normalizeTomlString(options.author, '--author', 'you')
  const license = normalizeLicense(options.license)
  const bundleIdentifierPrefix = normalizeBundleIdentifierPrefix(options.bundleIdentifierPrefix)
  const windowWidth = normalizeWindowDimension(options.windowWidth, '--window-width', '1000')
  const windowHeight = normalizeWindowDimension(options.windowHeight, '--window-height', '700')
  const packageManager = normalizePackageManagerOption(options.packageManager)
  const packageManagerPinnedSpec = packageManagerSpec(packageManager)

  return {
    APP_AUTHOR: author,
    APP_IDENTIFIER: `${bundleIdentifierPrefix}.${appName.replaceAll('-', '.')}`,
    APP_LICENSE: license,
    APP_NAME: appName,
    APP_PRODUCT_NAME: title,
    APP_TITLE: title,
    APP_WINDOW_HEIGHT: windowHeight,
    APP_WINDOW_WIDTH: windowWidth,
    CARGO_LICENSE_LINE: license === 'UNLICENSED' ? '' : `license = "${license}"`,
    CARGO_CRATE_NAME: cargoCrateName,
    CARGO_NAME: appName,
    PACKAGE_MANAGER: packageManager,
    PACKAGE_MANAGER_INSTALL_COMMAND: packageManagerInstallCommand(packageManager),
    PACKAGE_MANAGER_SPEC: packageManagerPinnedSpec,
    PACKAGE_MANAGER_SETUP_COMMAND: packageManagerSetupCommand(packageManager, packageManagerPinnedSpec),
  }
}

function formatFeatureList(features) {
  if (features.length === 0) return 'none'
  return features.map((feature) => feature.name).join(', ')
}

function quoteShellArgument(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`
}

function parseOptionalFeatureArgs(args) {
  return parseCommaList(args.features ?? args['optional-features'])
}

function normalizeSidebarOption(value) {
  const sidebar = String(value ?? 'both').trim().toLowerCase()
  if (!['left', 'right', 'both'].includes(sidebar)) {
    throw new Error('--sidebar must be one of: left, right, both')
  }
  return sidebar
}

function optionFromArgs(args, dashedKey, camelKey) {
  return args[dashedKey] ?? args[camelKey]
}

async function resolveCreateOptions(args, featureManifests) {
  if (Object.keys(args).length === 0 || args.advanced) {
    return promptForCreateAppWizard({
      packageManagers: supportedPackageManagers,
      defaultPackageManager,
      recipes: await listRecipeCatalog(featureManifests),
      features: listWizardFeatures(featureManifests),
      defaultTargetForName(name) {
        return path.join(process.cwd(), name)
      },
      validators: {
        name(value) {
          return normalizeAppName(value, 'Project name')
        },
        target: validateTargetDirectory,
        bundleIdentifierPrefix(value) {
          return normalizeBundleIdentifierPrefix(value, 'Bundle identifier prefix')
        },
        author(value) {
          return normalizeTomlString(value, 'Author', 'you')
        },
        license(value) {
          return normalizeLicense(value, 'License')
        },
        windowWidth(value) {
          return normalizeWindowDimension(value, 'Window width', '1000')
        },
        windowHeight(value) {
          return normalizeWindowDimension(value, 'Window height', '700')
        },
      },
      resolveSelection(recipeName, optionalFeatures) {
        return createSelectionPreview(recipeName, optionalFeatures, featureManifests)
      },
    })
  }

  return {
    name: args.name,
    target: args.target,
    recipe: args.recipe,
    optionalFeatures: parseOptionalFeatureArgs(args),
    sidebar: args.sidebar,
    packageManager: optionFromArgs(args, 'package-manager', 'packageManager'),
    author: args.author,
    bundleIdentifierPrefix: optionFromArgs(args, 'bundle-prefix', 'bundlePrefix'),
    windowWidth: optionFromArgs(args, 'window-width', 'windowWidth'),
    windowHeight: optionFromArgs(args, 'window-height', 'windowHeight'),
    license: args.license,
  }
}

async function writeTextIfChanged(filePath, content) {
  const current = (await pathExists(filePath)) ? await readFile(filePath, 'utf8') : null
  if (current !== content) {
    await writeFile(filePath, content)
  }
}

async function removePathIfExists(filePath) {
  if (await pathExists(filePath)) {
    await rm(filePath, { force: true, recursive: true })
  }
}

async function prepareGenerationTarget(targetDir, appName) {
  const targetParent = path.dirname(targetDir)
  await mkdir(targetParent, { recursive: true })

  if (await pathExists(targetDir)) {
    const entries = await readdir(targetDir)
    if (entries.length > 0) {
      throw new Error(`target directory must be empty: ${targetDir}`)
    }
  }

  const stagingDir = path.join(
    targetParent,
    `.tauri-creator-${appName}-${process.pid}-${Date.now()}.tmp`
  )
  await mkdir(stagingDir, { recursive: true })
  return stagingDir
}

async function publishGeneratedTarget(stagingDir, targetDir, throwIfInterrupted) {
  if (await pathExists(targetDir)) {
    try {
      await rmdir(targetDir)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(
          `target directory changed during generation and is no longer empty: ${targetDir}`,
          { cause: error }
        )
      }
    }
  }
  throwIfInterrupted()
  await rename(stagingDir, targetDir)
}

function removeMarkedBlock(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker)
  if (startIndex === -1) return source

  const endIndex = source.indexOf(endMarker, startIndex)
  if (endIndex === -1) return source

  const blockStart = source.lastIndexOf('\n', startIndex) + 1
  const endMarkerEnd = endIndex + endMarker.length
  const nextLineIndex = source.indexOf('\n', endMarkerEnd)
  const blockEnd = nextLineIndex === -1 ? source.length : nextLineIndex + 1

  return `${source.slice(0, blockStart)}${source.slice(blockEnd)}`
}

function removeSidebarBlocks(source, side) {
  const sideName = side.toUpperCase()
  let updated = source

  for (const marker of source.matchAll(new RegExp(`TAURI_CREATOR:SIDEBAR_${sideName}_START ([^\\s}*]+)`, 'g'))) {
    const blockName = marker[1]
    updated = removeMarkedBlock(
      updated,
      `TAURI_CREATOR:SIDEBAR_${sideName}_START ${blockName}`,
      `TAURI_CREATOR:SIDEBAR_${sideName}_END ${blockName}`
    )
  }

  return updated
}

function removeRightSidebarFromMainWindow(source) {
  return removeSidebarBlocks(source, 'right')
    .replace(
      'const MAIN_CONTENT_DEFAULT =\n  100 - LAYOUT.leftSidebar.default - LAYOUT.rightSidebar.default',
      'const MAIN_CONTENT_DEFAULT = 100 - LAYOUT.leftSidebar.default'
    )
}

function removeLeftSidebarFromMainWindow(source) {
  return removeSidebarBlocks(source, 'left')
    .replace(
      'const MAIN_CONTENT_DEFAULT =\n  100 - LAYOUT.leftSidebar.default - LAYOUT.rightSidebar.default',
      'const MAIN_CONTENT_DEFAULT = 100 - LAYOUT.rightSidebar.default'
    )
}

function removeRightSidebarFromTitleBar(source) {
  return removeSidebarBlocks(source, 'right')
}

function removeLeftSidebarFromTitleBar(source) {
  return removeSidebarBlocks(source, 'left')
}

async function applySidebarOption(targetDir, sidebar) {
  if (sidebar === 'both') return

  const layoutDir = path.join(targetDir, 'src', 'components', 'layout')
  if (!(await pathExists(layoutDir))) return

  const mainWindowPath = path.join(layoutDir, 'MainWindow.tsx')
  const titleBarPath = path.join(layoutDir, 'LayoutTitleBar.tsx')
  const indexPath = path.join(layoutDir, 'index.ts')
  const uiStorePath = path.join(targetDir, 'src', 'store', 'ui-store.ts')
  const uiStoreTestPath = path.join(targetDir, 'src', 'store', 'ui-store.test.ts')

  const mainWindow = await readFile(mainWindowPath, 'utf8')
  const titleBar = await readFile(titleBarPath, 'utf8')
  const index = await readFile(indexPath, 'utf8')

  if (sidebar === 'left') {
    await writeTextIfChanged(mainWindowPath, removeRightSidebarFromMainWindow(mainWindow))
    await writeTextIfChanged(titleBarPath, removeRightSidebarFromTitleBar(titleBar))
    await writeTextIfChanged(indexPath, index.replace("export { RightSideBar } from './RightSideBar'\n", ''))
    if (await pathExists(uiStorePath)) {
      await writeTextIfChanged(uiStorePath, removeSidebarBlocks(await readFile(uiStorePath, 'utf8'), 'right'))
    }
    if (await pathExists(uiStoreTestPath)) {
      await writeTextIfChanged(uiStoreTestPath, removeSidebarBlocks(await readFile(uiStoreTestPath, 'utf8'), 'right'))
    }
    await removePathIfExists(path.join(layoutDir, 'RightSideBar.tsx'))
    return
  }

  await writeTextIfChanged(mainWindowPath, removeLeftSidebarFromMainWindow(mainWindow))
  await writeTextIfChanged(titleBarPath, removeLeftSidebarFromTitleBar(titleBar))
  await writeTextIfChanged(indexPath, index.replace("export { LeftSideBar } from './LeftSideBar'\n", ''))
  if (await pathExists(uiStorePath)) {
    await writeTextIfChanged(uiStorePath, removeSidebarBlocks(await readFile(uiStorePath, 'utf8'), 'left'))
  }
  if (await pathExists(uiStoreTestPath)) {
    await writeTextIfChanged(uiStoreTestPath, removeSidebarBlocks(await readFile(uiStoreTestPath, 'utf8'), 'left'))
  }
  await removePathIfExists(path.join(layoutDir, 'LeftSideBar.tsx'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  if (args.advanced) {
    const combinedOptions = Object.keys(args).filter((key) => key !== 'advanced')
    if (combinedOptions.length > 0) {
      fail(`--advanced cannot be combined with ${combinedOptions.map((key) => `--${key}`).join(', ')}`)
    }
  }

  const featureManifests = await loadFeatureManifests()
  const options = await resolveCreateOptions(args, featureManifests)

  const isPrompted = args.advanced || Object.keys(args).length === 0
  if (!options.name) fail(isPrompted ? 'app name is required' : 'missing required --name')

  const values = buildTemplateValues(options.name, options)
  const targetDir = path.resolve(options.target ?? path.join(process.cwd(), values.APP_NAME))
  const baseFiles = await listFiles(baseDir)

  if (baseFiles.length === 0) {
    fail(`base directory has no files: ${baseDir}`)
  }

  const optionalFeatureNames = [...new Set(options.optionalFeatures ?? [])]
  const recipe = options.recipe ? await loadRecipe(options.recipe) : null
  const integrationMode = recipe ? 'recipe' : 'features'
  const requestedFeatureNames = [
    ...(recipe?.features ?? []),
    ...optionalFeatureNames,
  ]
  if (!recipe && requestedFeatureNames.length === 0 && !args.advanced) {
    fail('missing required --recipe or --features')
  }
  const allFeatures = resolveFeatureOrder({
    name: recipe?.name ?? 'manual-features',
    features: requestedFeatureNames,
  }, featureManifests)
  const resolvedFeatureNames = allFeatures.map((feature) => feature.name)
  const sidebar = normalizeSidebarOption(options.sidebar)
  if (args.sidebar && !resolvedFeatureNames.includes('ui-layout')) {
    fail('--sidebar can only be used when ui-layout is enabled')
  }

  const initialState = {
    schemaVersion: 2,
    packageName: values.APP_NAME,
    productName: values.APP_PRODUCT_NAME,
    bundleIdentifier: values.APP_IDENTIFIER,
    author: values.APP_AUTHOR,
    license: values.APP_LICENSE,
    packageManager: values.PACKAGE_MANAGER,
    packageManagerSpec: values.PACKAGE_MANAGER_SPEC,
    window: {
      width: Number(values.APP_WINDOW_WIDTH),
      height: Number(values.APP_WINDOW_HEIGHT),
    },
    integrationMode,
    recipe: recipe?.name ?? null,
    requestedFeatures: requestedFeatureNames,
    resolvedFeatures: resolvedFeatureNames,
    recipeFeatures: recipe ? resolveFeatureOrder(recipe, featureManifests).map((feature) => feature.name) : [],
    optionalFeatures: optionalFeatureNames,
    options: {
      layout: {
        sidebar,
      },
    },
    enabledFeatures: [],
    baseFiles,
  }

  const generationInterrupt = createGenerationInterruptGuard()
  let stagingDir = null
  let published = false

  try {
    stagingDir = await prepareGenerationTarget(targetDir, values.APP_NAME)
    generationInterrupt.throwIfInterrupted()

    await cp(baseDir, stagingDir, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.gitkeep',
    })
    generationInterrupt.throwIfInterrupted()

    await replaceTemplatesInTree(stagingDir, values)
    await writeFile(
      path.join(stagingDir, 'PROJECT_MAP.md'),
      renderProjectMap(initialState, featureManifests)
    )
    await writeFile(
      path.join(stagingDir, '.tauri-creator.json'),
      `${JSON.stringify(initialState, null, 2)}\n`
    )

    for (const feature of allFeatures) {
      execFileSync(process.execPath, [
        applyFeatureScript,
        '--target',
        stagingDir,
        '--feature',
        feature.name,
      ], {
        cwd: root,
        stdio: 'pipe',
      })
      generationInterrupt.throwIfInterrupted()
    }

    const statePath = path.join(stagingDir, '.tauri-creator.json')
    const finalState = await readJson(statePath)
    await applySidebarOption(stagingDir, finalState.options?.layout?.sidebar ?? 'both')
    // Feature files and JSON patches are applied after the base template pass.
    await replaceTemplatesInTree(stagingDir, values)
    await writeFile(
      statePath,
      `${JSON.stringify(finalState, null, 2)}\n`
    )
    await writeFile(
      path.join(stagingDir, 'PROJECT_MAP.md'),
      renderProjectMap(finalState, featureManifests)
    )

    generationInterrupt.throwIfInterrupted()
    await publishGeneratedTarget(
      stagingDir,
      targetDir,
      generationInterrupt.throwIfInterrupted
    )
    published = true
  } catch (error) {
    if (error?.signal === 'SIGINT' || error?.signal === 'SIGTERM') {
      throw new GenerationInterruptedError(error.signal)
    }
    generationInterrupt.throwIfInterrupted()
    throw error
  } finally {
    try {
      if (stagingDir && !published) {
        await rm(stagingDir, { recursive: true, force: true })
      }
    } finally {
      generationInterrupt.close()
    }
  }

  console.log(`Created ${values.APP_NAME} at ${targetDir}`)
  console.log(`Integration mode: ${integrationMode}`)
  console.log(`Recipe: ${recipe?.name ?? 'none'}`)
  console.log(`Requested features: ${optionalFeatureNames.length === 0 && !recipe ? 'none' : requestedFeatureNames.join(', ') || 'none'}`)
  console.log(`Resolved features: ${resolvedFeatureNames.join(', ') || 'none'}`)
  console.log(`Enabled features: ${formatFeatureList(allFeatures)}`)
  console.log(`Sidebar layout: ${sidebar}`)
  console.log(`Package manager: ${values.PACKAGE_MANAGER}`)
  console.log(
    `Next: cd ${quoteShellArgument(targetDir)} && ${values.PACKAGE_MANAGER} install && ${values.PACKAGE_MANAGER} run check:all`
  )
}

try {
  await main()
} catch (error) {
  if (error instanceof PromptCancelledError) {
    console.log('Creation cancelled. No files were written.')
  } else if (error instanceof GenerationInterruptedError) {
    console.error(`create-app: ${error.message}`)
    process.exitCode = error.signal === 'SIGTERM' ? 143 : 130
  } else {
    fail(error.message)
  }
}
