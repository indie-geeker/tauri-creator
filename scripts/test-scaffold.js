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
const starterTarget = path.join(tempRoot, 'starter-demo')
const fullTarget = path.join(tempRoot, 'full-demo')
const featureTarget = path.join(tempRoot, 'feature-demo')
const fullRightTarget = path.join(tempRoot, 'full-right-demo')
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
    rootPackage.scripts['check:generated:strict'] ===
      'node scripts/verify-generated-app.js --recipe full --package-manager npm --strict',
    'root package should expose strict full generated-app verification'
  )
  assert(
    rootPackage.scripts['check:generated:pnpm'] ===
      'node scripts/verify-generated-app.js --recipe starter --package-manager pnpm',
    'root package should verify the starter app through pnpm'
  )
  assert(
    rootPackage.scripts['check:generated:tauri-build:starter'] ===
      'node scripts/verify-generated-app.js --recipe starter --package-manager npm --tauri-build',
    'root package should expose starter Tauri bundle verification'
  )
  assert(
    rootPackage.scripts['check:generated:tauri-build:full'] ===
      'node scripts/verify-generated-app.js --recipe full --package-manager npm --tauri-build',
    'root package should expose full Tauri bundle verification'
  )
  assert(
    rootPackage.scripts['check:release'] ===
      'npm run check:generated:tauri-build:starter && npm run check:generated:tauri-build:full',
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
    'starter-demo',
    '--target',
    starterTarget,
    '--recipe',
    'starter',
  ])
  const starterState = await readJson(path.join(starterTarget, '.tauri-creator.json'))
  assertFeatures(
    starterState,
    ['specta-bindings', 'preferences', 'logging', 'diagnostics'],
    'starter should enable exactly the typed production foundation features'
  )
  for (const excludedFeature of ['dx-tools', 'quick-pane', 'sqlite', 'updater', 'project-governance']) {
    assert(!starterState.enabledFeatures.includes(excludedFeature), `starter should exclude ${excludedFeature}`)
  }
  assert(await pathExists(path.join(starterTarget, 'src', 'lib', 'logger.ts')), 'starter should include logging')
  assert(await pathExists(path.join(starterTarget, 'src', 'features', 'diagnostics', 'index.ts')), 'starter should include diagnostics')
  assert(
    await pathExists(path.join(starterTarget, 'src-tauri', 'src', 'bindings.rs')),
    'starter should include generated Specta binding source'
  )
  const starterPackage = await readJson(path.join(starterTarget, 'package.json'))
  assert(
    starterPackage.scripts['rust:bindings'] === 'cd src-tauri && cargo test export_bindings -- --ignored --nocapture',
    'starter should document TypeScript binding generation through npm run rust:bindings'
  )
  const starterRustLib = await readFile(path.join(starterTarget, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    starterRustLib.includes('builder.invoke_handler()'),
    'starter should route Tauri commands through the Specta invoke handler'
  )
  const starterBindings = await readFile(path.join(starterTarget, 'src-tauri', 'src', 'bindings.rs'), 'utf8')
  assert(
    starterBindings.includes('preferences::load_preferences') &&
      starterBindings.includes('diagnostics::collect_diagnostics'),
    'starter bindings should export typed commands from foundation features'
  )
  const starterPreferencesRust = await readFile(
    path.join(starterTarget, 'src-tauri', 'src', 'features', 'preferences.rs'),
    'utf8'
  )
  assert(
    starterPreferencesRust.includes('#[specta::specta]') &&
      starterPreferencesRust.includes('specta::Type'),
    'starter should inject Specta command and type attributes into preferences'
  )
  const starterDiagnosticsRust = await readFile(
    path.join(starterTarget, 'src-tauri', 'src', 'features', 'diagnostics.rs'),
    'utf8'
  )
  assert(
    starterDiagnosticsRust.includes('#[specta::specta]') &&
      starterDiagnosticsRust.includes('specta::Type'),
    'starter should inject Specta command and type attributes into diagnostics'
  )
  await assertNoUnresolvedPlaceholders(starterTarget)

  createApp([
    '--name',
    'full-demo',
    '--target',
    fullTarget,
    '--recipe',
    'full',
  ])
  const fullState = await readJson(path.join(fullTarget, '.tauri-creator.json'))
  assertFeatures(
    fullState,
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
    'full should enable the complete manifest-resolved reference feature set'
  )
  assert(await pathExists(path.join(fullTarget, 'src', 'components', 'layout', 'MainWindow.tsx')), 'full should include the layout shell')
  assert(await pathExists(path.join(fullTarget, 'src', 'features', 'sqlite', 'index.ts')), 'full should include sqlite')
  assert(await pathExists(path.join(fullTarget, 'src', 'features', 'updater', 'index.ts')), 'full should include updater')
  assert(await pathExists(path.join(fullTarget, 'src', 'features', 'quick-pane', 'index.tsx')), 'full should include quick-pane through layout dependencies')
  const fullApp = await readFile(path.join(fullTarget, 'src', 'App.tsx'), 'utf8')
  assertUniqueImport(
    fullApp,
    "import { useEffect } from 'react'",
    'full should not generate duplicate React hook imports'
  )
  await assertNoUnresolvedPlaceholders(fullTarget)
  assert(
    await pathExists(path.join(fullTarget, '.github', 'workflows', 'release.yml')),
    'full should include a release workflow'
  )
  assert(
    await pathExists(path.join(fullTarget, 'docs', 'CONTRIBUTING.md')),
    'full should include contributing docs'
  )
  assert(
    await pathExists(path.join(fullTarget, 'docs', 'SECURITY.md')),
    'full should include security docs'
  )
  assert(
    await pathExists(path.join(fullTarget, 'LICENSE.md')),
    'full should include a generated license note'
  )
  assert(
    await pathExists(path.join(fullTarget, '.ast-grep', 'rules')),
    'full should include strict dx tooling'
  )
  const fullPackageJson = await readJson(path.join(fullTarget, 'package.json'))
  for (const [scriptName, command] of Object.entries(fullPackageJson.scripts)) {
    assert(
      !command.includes('source ~/.cargo/env'),
      `full ${scriptName} should not depend on source or ~/.cargo/env`
    )
  }
  assert(
    fullPackageJson.scripts['check:all'].includes(
      'cargo clippy --manifest-path src-tauri/Cargo.toml'
    ),
    'full check:all should retain the Rust clippy gate'
  )
  assert(
    await pathExists(path.join(fullTarget, 'src-tauri', 'src', 'bindings.rs')),
    'full should include Specta bindings'
  )

  runNode(removeFeatureScript, [
    '--target',
    fullTarget,
    '--feature',
    'diagnostics',
  ])

  assert(
    !(await pathExists(path.join(fullTarget, 'src-tauri', 'src', 'features', 'diagnostics.rs'))),
    'remove-feature should delete diagnostics Rust file in scaffold smoke'
  )
  const fullMapAfterRemoval = await readFile(path.join(fullTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(
    !fullMapAfterRemoval.includes('collect_diagnostics'),
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
    'full-right-demo',
    '--target',
    fullRightTarget,
    '--recipe',
    'full',
    '--sidebar',
    'right',
  ])
  const fullRightState = await readJson(path.join(fullRightTarget, '.tauri-creator.json'))
  assert(fullRightState.options.layout.sidebar === 'right', 'full should record right sidebar generation option')
  const fullRightMainWindow = await readFile(
    path.join(fullRightTarget, 'src', 'components', 'layout', 'MainWindow.tsx'),
    'utf8'
  )
  assert(!fullRightMainWindow.includes('LeftSideBar'), 'right sidebar generation should remove left sidebar code')
  assert(fullRightMainWindow.includes('RightSideBar'), 'right sidebar generation should keep right sidebar code')

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
