import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultPackageManager } from './package-managers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const createAppScript = path.join(root, 'scripts', 'create-app.js')
const applyFeatureScript = path.join(root, 'scripts', 'apply-feature.js')
const removeFeatureScript = path.join(root, 'scripts', 'remove-feature.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function textFromCodes(codes) {
  return String.fromCharCode(...codes)
}

function runNode(script, args) {
  execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'pipe',
  })
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

async function readTextFileIfPossible(filePath) {
  const buffer = await readFile(filePath)
  if (buffer.includes(0)) return null
  return buffer.toString('utf8')
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function listFiles(dir, prefix = '') {
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

async function assertNoUnresolvedPlaceholders(targetDir) {
  const files = await listFiles(targetDir)
  const placeholderPatterns = [
    /{{[A-Z][A-Z0-9_]*}}/,
    'YOUR_USERNAME',
    'YOUR_',
    textFromCodes([116, 97, 117, 114, 105, 45, 116, 101, 109, 112, 108, 97, 116, 101]),
  ]

  for (const file of files) {
    const text = await readTextFileIfPossible(path.join(targetDir, file))
    if (text === null) continue

    for (const pattern of placeholderPatterns) {
      assert(
        !(typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)),
        `${file} should not contain unresolved placeholder '${pattern}'`
      )
    }
  }
}

function createApp(args) {
  runNode(createAppScript, args)
}

function assertFeatures(state, featureNames, message) {
  assert(
    state.enabledFeatures.join(',') === featureNames.join(','),
    `${message}: expected ${featureNames.join(',')} but got ${state.enabledFeatures.join(',')}`
  )
}

function assertUniqueImport(source, importStatement, message) {
  const escapedImport = importStatement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = source.match(new RegExp(escapedImport, 'g')) ?? []
  assert(matches.length <= 1, `${message}: found ${matches.length} copies`)
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-scaffold-'))
const minimalTarget = path.join(tempRoot, 'minimal-demo')
const essentialTarget = path.join(tempRoot, 'essential-demo')
const desktopTarget = path.join(tempRoot, 'desktop-demo')
const productionTarget = path.join(tempRoot, 'production-demo')
const featureTarget = path.join(tempRoot, 'feature-demo')
const desktopRightTarget = path.join(tempRoot, 'desktop-right-demo')
const legacyStateTarget = path.join(tempRoot, 'legacy-state-demo')

try {
  const rootPackage = await readJson(path.join(root, 'package.json'))
  const ciWorkflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert(rootPackage.packageManager?.startsWith('npm@'), 'root package.json should pin npm')
  assert(
    await pathExists(path.join(root, 'package-lock.json')),
    'npm-first root package should include package-lock.json for audit and CI'
  )
  assert(
    !(await pathExists(path.join(root, 'pnpm-lock.yaml'))),
    'npm-first root package should not keep an empty pnpm lockfile at the root'
  )
  assert(defaultPackageManager === 'npm', 'create-app should default generated apps to npm')
  assert(
    !Object.values(rootPackage.scripts).some((script) => script.includes('pnpm run')),
    'root package scripts should not hard-code pnpm run internally'
  )
  assert(rootPackage.scripts['check:fast'], 'root package should expose check:fast for scaffold-only checks')
  assert(
    rootPackage.scripts['check:generated']?.includes('check:generated:npm') &&
      rootPackage.scripts['check:generated']?.includes('check:generated:pnpm') &&
      rootPackage.scripts['check:generated']?.includes('check:generated:strict'),
    'root package should compose npm, pnpm, and strict generated-app verification'
  )
  assert(
    rootPackage.scripts['check:generated:npm'] === 'node scripts/verify-generated-app.js --package-manager npm',
    'root package should verify generated apps through the recipe catalog for npm'
  )
  assert(
    rootPackage.scripts['check:generated:strict']?.includes('--recipe production') &&
      rootPackage.scripts['check:generated:strict']?.includes('--strict'),
    'root package should expose strict production generated-app verification'
  )
  assert(
    rootPackage.scripts['check:generated:pnpm']?.includes('--package-manager pnpm'),
    'root package should verify at least one generated app through pnpm'
  )
  assert(
    rootPackage.scripts['check:generated:tauri-build:npm']?.includes('--recipe production') &&
      rootPackage.scripts['check:generated:tauri-build:npm']?.includes('--tauri-build'),
    'root package should expose npm production Tauri bundle verification'
  )
  assert(
    rootPackage.scripts['check:generated:tauri-build:pnpm']?.includes('--recipe desktop') &&
      rootPackage.scripts['check:generated:tauri-build:pnpm']?.includes('--package-manager pnpm') &&
      rootPackage.scripts['check:generated:tauri-build:pnpm']?.includes('--tauri-build'),
    'root package should expose pnpm desktop Tauri bundle verification'
  )
  assert(
    rootPackage.scripts['check:release']?.includes('check:generated:tauri-build:npm') &&
      rootPackage.scripts['check:release']?.includes('check:generated:tauri-build:pnpm'),
    'root package should compose release-oriented Tauri bundle checks'
  )
  const pnpmGeneratedCheckIndex = ciWorkflow.indexOf('npm run check:generated:pnpm')
  const pnpmActionSetupIndex = ciWorkflow.indexOf('pnpm/action-setup')
  const corepackEnableIndex = ciWorkflow.indexOf('corepack enable')
  const corepackPrepareIndex = ciWorkflow.indexOf('corepack prepare pnpm@')
  const ciUsesPnpmAction =
    pnpmActionSetupIndex !== -1 &&
    pnpmGeneratedCheckIndex !== -1 &&
    pnpmActionSetupIndex < pnpmGeneratedCheckIndex
  const ciUsesCorepackPnpm =
    corepackEnableIndex !== -1 &&
    corepackPrepareIndex !== -1 &&
    pnpmGeneratedCheckIndex !== -1 &&
    corepackEnableIndex < corepackPrepareIndex &&
    corepackPrepareIndex < pnpmGeneratedCheckIndex
  assert(
    ciUsesPnpmAction || ciUsesCorepackPnpm,
    'CI should install or activate pnpm before running generated pnpm verification'
  )
  assert(
    rootPackage.scripts['check:all'] === 'npm run check:fast && npm run check:generated',
    'root package check:all should run fast checks and full generated-app checks'
  )
  const readme = await readFile(path.join(root, 'README.md'), 'utf8')
  assert(
    !readme.includes('pnpm run'),
    'README should not use pnpm commands in npm-first examples'
  )
  assert(
    readme.includes('npm run create-app -- --name demo-tool'),
    'README should show npm -- forwarding for create-app options'
  )

  createApp([
    '--name',
    'minimal-demo',
    '--target',
    minimalTarget,
    '--recipe',
    'minimal',
  ])
  assert(await pathExists(path.join(minimalTarget, 'src', 'App.tsx')), 'minimal should copy App.tsx')
  await assertNoUnresolvedPlaceholders(minimalTarget)

  const minimalState = await readJson(path.join(minimalTarget, '.tauri-creator.json'))
  assertFeatures(minimalState, [], 'minimal should enable no features')
  assert(minimalState.integrationMode === 'recipe', 'minimal should record recipe integration mode')
  assert(minimalState.recipe === 'minimal', 'minimal should record the minimal recipe')

  createApp([
    '--name',
    'essential-demo',
    '--target',
    essentialTarget,
    '--recipe',
    'essential',
  ])
  const essentialState = await readJson(path.join(essentialTarget, '.tauri-creator.json'))
  assertFeatures(
    essentialState,
    ['specta-bindings', 'preferences', 'logging', 'diagnostics'],
    'essential should enable typed production foundation features'
  )
  assert(await pathExists(path.join(essentialTarget, 'src', 'lib', 'logger.ts')), 'essential should include logging')
  assert(await pathExists(path.join(essentialTarget, 'src', 'features', 'diagnostics', 'index.ts')), 'essential should include diagnostics')
  assert(
    await pathExists(path.join(essentialTarget, 'src-tauri', 'src', 'bindings.rs')),
    'essential should include generated Specta binding source'
  )
  const essentialPackage = await readJson(path.join(essentialTarget, 'package.json'))
  assert(
    essentialPackage.scripts['rust:bindings'] === 'cd src-tauri && cargo test export_bindings -- --ignored --nocapture',
    'essential should document TypeScript binding generation through npm run rust:bindings'
  )
  const essentialRustLib = await readFile(path.join(essentialTarget, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    essentialRustLib.includes('builder.invoke_handler()'),
    'essential should route Tauri commands through the Specta invoke handler'
  )
  const essentialBindings = await readFile(path.join(essentialTarget, 'src-tauri', 'src', 'bindings.rs'), 'utf8')
  assert(
    essentialBindings.includes('preferences::load_preferences') &&
      essentialBindings.includes('diagnostics::collect_diagnostics'),
    'essential bindings should export typed commands from foundation features'
  )
  const essentialPreferencesRust = await readFile(
    path.join(essentialTarget, 'src-tauri', 'src', 'features', 'preferences.rs'),
    'utf8'
  )
  assert(
    essentialPreferencesRust.includes('#[specta::specta]') &&
      essentialPreferencesRust.includes('specta::Type'),
    'essential should inject Specta command and type attributes into preferences'
  )
  const essentialDiagnosticsRust = await readFile(
    path.join(essentialTarget, 'src-tauri', 'src', 'features', 'diagnostics.rs'),
    'utf8'
  )
  assert(
    essentialDiagnosticsRust.includes('#[specta::specta]') &&
      essentialDiagnosticsRust.includes('specta::Type'),
    'essential should inject Specta command and type attributes into diagnostics'
  )
  await assertNoUnresolvedPlaceholders(essentialTarget)

  createApp([
    '--name',
    'desktop-demo',
    '--target',
    desktopTarget,
    '--recipe',
    'desktop',
  ])
  const desktopState = await readJson(path.join(desktopTarget, '.tauri-creator.json'))
  assertFeatures(
    desktopState,
    [
      'specta-bindings',
      'preferences',
      'logging',
      'diagnostics',
      'app-lifecycle',
      'command-palette',
      'native-menu',
      'ui-tailwind',
      'ui-shadcn',
      'app-state',
      'i18n',
      'quick-pane',
      'ui-preferences',
      'ui-layout',
      'sqlite',
      'project-governance',
      'updater',
    ],
    'desktop should enable the complete stable production feature set'
  )
  assert(await pathExists(path.join(desktopTarget, 'src', 'components', 'layout', 'MainWindow.tsx')), 'desktop should include the layout shell')
  assert(await pathExists(path.join(desktopTarget, 'src', 'features', 'sqlite', 'index.ts')), 'desktop should include sqlite')
  assert(await pathExists(path.join(desktopTarget, 'src', 'features', 'updater', 'index.ts')), 'desktop should include updater')
  assert(await pathExists(path.join(desktopTarget, 'src', 'features', 'quick-pane', 'index.tsx')), 'desktop should include quick-pane through layout dependencies')
  const desktopApp = await readFile(path.join(desktopTarget, 'src', 'App.tsx'), 'utf8')
  assertUniqueImport(
    desktopApp,
    "import { useEffect } from 'react'",
    'desktop should not generate duplicate React hook imports'
  )
  await assertNoUnresolvedPlaceholders(desktopTarget)

  createApp([
    '--name',
    'production-demo',
    '--target',
    productionTarget,
    '--recipe',
    'production',
  ])
  const productionState = await readJson(path.join(productionTarget, '.tauri-creator.json'))
  assertFeatures(
    productionState,
    [
      'specta-bindings',
      'preferences',
      'logging',
      'diagnostics',
      'app-lifecycle',
      'command-palette',
      'native-menu',
      'ui-tailwind',
      'ui-shadcn',
      'app-state',
      'i18n',
      'quick-pane',
      'ui-preferences',
      'ui-layout',
      'sqlite',
      'project-governance',
      'updater',
      'dx-tools',
    ],
    'production should enable the complete verified app foundation'
  )
  assert(
    await pathExists(path.join(productionTarget, '.github', 'workflows', 'release.yml')),
    'production should include a release workflow'
  )
  assert(
    await pathExists(path.join(productionTarget, 'docs', 'CONTRIBUTING.md')),
    'production should include contributing docs'
  )
  assert(
    await pathExists(path.join(productionTarget, 'docs', 'SECURITY.md')),
    'production should include security docs'
  )
  assert(
    await pathExists(path.join(productionTarget, 'LICENSE.md')),
    'production should include a generated license note'
  )
  assert(
    await pathExists(path.join(productionTarget, '.ast-grep', 'rules')),
    'production should include strict dx tooling'
  )
  assert(
    await pathExists(path.join(productionTarget, 'src-tauri', 'src', 'bindings.rs')),
    'production should include Specta bindings'
  )
  await assertNoUnresolvedPlaceholders(productionTarget)

  runNode(removeFeatureScript, [
    '--target',
    desktopTarget,
    '--feature',
    'diagnostics',
  ])

  assert(
    !(await pathExists(path.join(desktopTarget, 'src-tauri', 'src', 'features', 'diagnostics.rs'))),
    'remove-feature should delete diagnostics Rust file in scaffold smoke'
  )
  const desktopMapAfterRemoval = await readFile(path.join(desktopTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(
    !desktopMapAfterRemoval.includes('collect_diagnostics'),
    'remove-feature should remove deleted feature commands from PROJECT_MAP.md'
  )

  createApp([
    '--name',
    'feature-demo',
    '--target',
    featureTarget,
    '--features',
    'logging,diagnostics',
  ])
  const featureState = await readJson(path.join(featureTarget, '.tauri-creator.json'))
  assert(featureState.integrationMode === 'features', 'manual feature creation should record feature integration mode')
  assert(featureState.recipe === null, 'manual feature creation should not record a recipe')
  assertFeatures(featureState, ['logging', 'diagnostics'], 'manual feature creation should apply selected features')
  await assertNoUnresolvedPlaceholders(featureTarget)

  createApp([
    '--name',
    'desktop-right-demo',
    '--target',
    desktopRightTarget,
    '--recipe',
    'desktop',
    '--sidebar',
    'right',
  ])
  const desktopRightState = await readJson(path.join(desktopRightTarget, '.tauri-creator.json'))
  assert(desktopRightState.options.layout.sidebar === 'right', 'desktop should record right sidebar generation option')
  const desktopRightMainWindow = await readFile(
    path.join(desktopRightTarget, 'src', 'components', 'layout', 'MainWindow.tsx'),
    'utf8'
  )
  assert(!desktopRightMainWindow.includes('LeftSideBar'), 'right sidebar generation should remove left sidebar code')
  assert(desktopRightMainWindow.includes('RightSideBar'), 'right sidebar generation should keep right sidebar code')

  runNode(applyFeatureScript, [
    '--target',
    featureTarget,
    '--feature',
    'quick-pane',
  ])
  const featureWithQuickPaneState = await readJson(path.join(featureTarget, '.tauri-creator.json'))
  assert(
    featureWithQuickPaneState.enabledFeatures.includes('quick-pane'),
    'apply-feature should still add features after feature-mode generation'
  )

  createApp([
    '--name',
    'legacy-state-demo',
    '--target',
    legacyStateTarget,
    '--recipe',
    'minimal',
  ])
  const legacyStatePath = path.join(legacyStateTarget, '.tauri-creator.json')
  const legacyState = await readJson(legacyStatePath)
  delete legacyState.schemaVersion
  delete legacyState.integrationMode
  delete legacyState.requestedFeatures
  delete legacyState.resolvedFeatures
  delete legacyState.recipeFeatures
  delete legacyState.optionalFeatures
  delete legacyState.options
  delete legacyState.enabledFeatures
  await writeFile(legacyStatePath, `${JSON.stringify(legacyState, null, 2)}\n`)

  runNode(applyFeatureScript, [
    '--target',
    legacyStateTarget,
    '--feature',
    'logging',
  ])
  const legacyStateAfterApply = await readJson(legacyStatePath)
  assert(
    legacyStateAfterApply.enabledFeatures.includes('logging'),
    'apply-feature should tolerate generated state without v2 arrays'
  )
  const legacyMapAfterApply = await readFile(path.join(legacyStateTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(
    legacyMapAfterApply.includes('Sidebar layout: `both`'),
    'PROJECT_MAP.md should default missing legacy options while applying features'
  )

  runNode(removeFeatureScript, [
    '--target',
    legacyStateTarget,
    '--feature',
    'logging',
  ])
  const legacyStateAfterRemoval = await readJson(legacyStatePath)
  assert(
    !legacyStateAfterRemoval.enabledFeatures.includes('logging'),
    'remove-feature should tolerate generated state without v2 arrays'
  )
  const legacyMapAfterRemoval = await readFile(path.join(legacyStateTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(
    legacyMapAfterRemoval.includes('Enabled features: none'),
    'PROJECT_MAP.md should update after removing features from legacy state'
  )
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

console.log('scaffold smoke test passed')
