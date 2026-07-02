import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const createAppScript = path.join(root, 'scripts', 'create-app.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function runCreateApp(args, options = {}) {
  return execFileSync(process.execPath, [createAppScript, ...args], {
    cwd: root,
    encoding: options.encoding,
    input: options.input,
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readState(targetDir) {
  return readJson(path.join(targetDir, '.tauri-creator.json'))
}

function assertStateIncludes(state, featureNames, message) {
  for (const featureName of featureNames) {
    assert(state.enabledFeatures.includes(featureName), `${message}: missing ${featureName}`)
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-create-app-'))
const minimalTarget = path.join(tempRoot, 'minimal-demo')
const essentialTarget = path.join(tempRoot, 'essential-demo')
const desktopTarget = path.join(tempRoot, 'desktop-demo')
const productionTarget = path.join(tempRoot, 'production-demo')
const featureTarget = path.join(tempRoot, 'feature-demo')
const leftSidebarTarget = path.join(tempRoot, 'left-sidebar-demo')
const rightSidebarTarget = path.join(tempRoot, 'right-sidebar-demo')
const bothSidebarTarget = path.join(tempRoot, 'both-sidebar-demo')
const interactiveTarget = path.join(tempRoot, 'interactive-demo')
const pnpmManagerTarget = path.join(tempRoot, 'pnpm-manager-demo')
const pnpmProductionTarget = path.join(tempRoot, 'pnpm-production-demo')
const brokenFeatureDir = path.join(root, 'features', 'broken-readiness-test')
const brokenTarget = path.join(tempRoot, 'broken-readiness-demo')

try {
  runCreateApp([
    '--name',
    'minimal-demo',
    '--target',
    minimalTarget,
    '--recipe',
    'minimal',
  ])

  assert(await pathExists(path.join(minimalTarget, 'package.json')), 'minimal should copy package.json')
  assert(await pathExists(path.join(minimalTarget, 'src-tauri', 'tauri.conf.json')), 'minimal should copy Tauri config')
  assert(await pathExists(path.join(minimalTarget, 'PROJECT_MAP.md')), 'minimal should create PROJECT_MAP.md')

  const minimalState = await readState(minimalTarget)
  assert(minimalState.schemaVersion === 2, 'minimal should write schemaVersion 2')
  assert(minimalState.integrationMode === 'recipe', 'minimal should record recipe integration mode')
  assert(minimalState.recipe === 'minimal', 'minimal should record the selected recipe')
  assert(minimalState.requestedFeatures.length === 0, 'minimal should request no features')
  assert(minimalState.resolvedFeatures.length === 0, 'minimal should resolve no features')
  assert(minimalState.enabledFeatures.length === 0, 'minimal should enable no features')
  assert(minimalState.options.layout.sidebar === 'both', 'minimal should default sidebar layout to both')

  const minimalProjectMap = await readFile(path.join(minimalTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(minimalProjectMap.includes('Integration mode: `recipe`'), 'PROJECT_MAP.md should show integration mode')
  assert(minimalProjectMap.includes('Recipe: `minimal`'), 'PROJECT_MAP.md should show selected recipe')
  assert(minimalProjectMap.includes('Requested features: none'), 'PROJECT_MAP.md should show requested features')
  assert(minimalProjectMap.includes('Resolved features: none'), 'PROJECT_MAP.md should show resolved features')
  assert(minimalProjectMap.includes('Sidebar layout: `both`'), 'PROJECT_MAP.md should show sidebar layout')

  const minimalPackage = await readJson(path.join(minimalTarget, 'package.json'))
  assert(minimalPackage.name === 'minimal-demo', 'package.json should replace the app name')
  assert(minimalPackage.packageManager?.startsWith('npm@'), 'package.json should pin npm by default')

  runCreateApp([
    '--name',
    'essential-demo',
    '--target',
    essentialTarget,
    '--recipe',
    'essential',
  ])

  const essentialState = await readState(essentialTarget)
  assert(
    essentialState.enabledFeatures.join(',') === 'specta-bindings,preferences,logging,diagnostics',
    'essential should enable the production foundation features'
  )
  assert(await pathExists(path.join(essentialTarget, 'src-tauri', 'src', 'bindings.rs')), 'essential should include Specta bindings')
  assert(await pathExists(path.join(essentialTarget, 'src', 'features', 'preferences', 'index.ts')), 'essential should include preferences')
  assert(await pathExists(path.join(essentialTarget, 'src', 'lib', 'logger.ts')), 'essential should include logging')
  assert(await pathExists(path.join(essentialTarget, 'src', 'features', 'diagnostics', 'index.ts')), 'essential should include diagnostics')

  runCreateApp([
    '--name',
    'desktop-demo',
    '--target',
    desktopTarget,
    '--recipe',
    'desktop',
  ])

  const desktopState = await readState(desktopTarget)
  assert(desktopState.integrationMode === 'recipe', 'desktop should use recipe integration mode')
  assert(desktopState.recipe === 'desktop', 'desktop should record the selected recipe')
  assertStateIncludes(
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
    'desktop should include all stable production features'
  )
  assert(await pathExists(path.join(desktopTarget, 'src', 'components', 'layout', 'MainWindow.tsx')), 'desktop should include the layout shell')
  assert(await pathExists(path.join(desktopTarget, 'src', 'features', 'sqlite', 'index.ts')), 'desktop should include sqlite')
  assert(await pathExists(path.join(desktopTarget, 'src', 'features', 'updater', 'index.ts')), 'desktop should include updater')
  const desktopTauriConfig = await readFile(path.join(desktopTarget, 'src-tauri', 'tauri.conf.json'), 'utf8')
  assert(!desktopTauriConfig.includes('{{APP_NAME}}'), 'feature JSON patches should render app name placeholders')
  assert(
    desktopTauriConfig.includes('https://github.com/desktop-demo/desktop-demo/releases/latest/download/latest.json'),
    'updater endpoint should use the generated app name'
  )
  const desktopReleaseWorkflow = await readFile(path.join(desktopTarget, '.github', 'workflows', 'release.yml'), 'utf8')
  assert(!desktopReleaseWorkflow.includes('{{APP_TITLE}}'), 'feature files should render app title placeholders')
  assert(desktopReleaseWorkflow.includes('name: Release Desktop Demo'), 'release workflow should use the generated product name')

  runCreateApp([
    '--name',
    'production-demo',
    '--target',
    productionTarget,
    '--recipe',
    'production',
  ])

  const productionState = await readState(productionTarget)
  assertStateIncludes(
    productionState,
    [
      'specta-bindings',
      'preferences',
      'logging',
      'diagnostics',
      'app-lifecycle',
      'command-palette',
      'native-menu',
      'ui-layout',
      'sqlite',
      'project-governance',
      'updater',
      'dx-tools',
    ],
    'production should include all requested production features'
  )
  assert(await pathExists(path.join(productionTarget, '.github', 'workflows', 'release.yml')), 'production should include a release workflow')
  assert(await pathExists(path.join(productionTarget, 'docs', 'CONTRIBUTING.md')), 'production should include contributing docs')
  assert(await pathExists(path.join(productionTarget, 'docs', 'SECURITY.md')), 'production should include security docs')
  assert(await pathExists(path.join(productionTarget, 'LICENSE.md')), 'production should include license guidance')
  assert(await pathExists(path.join(productionTarget, '.ast-grep', 'rules')), 'production should include dx tools')

  runCreateApp([
    '--name',
    'feature-demo',
    '--target',
    featureTarget,
    '--features',
    'logging,diagnostics',
  ])

  const featureState = await readState(featureTarget)
  assert(featureState.integrationMode === 'features', '--features without --recipe should use feature integration mode')
  assert(featureState.recipe === null, 'feature integration should not record a recipe')
  assert(featureState.requestedFeatures.join(',') === 'logging,diagnostics', 'feature integration should record requested features')
  assert(featureState.resolvedFeatures.join(',') === 'logging,diagnostics', 'feature integration should resolve requested features')
  assert(featureState.enabledFeatures.join(',') === 'logging,diagnostics', 'feature integration should enable requested features')

  runCreateApp([
    '--name',
    'left-sidebar-demo',
    '--target',
    leftSidebarTarget,
    '--recipe',
    'desktop',
    '--sidebar',
    'left',
  ])

  const leftState = await readState(leftSidebarTarget)
  assert(leftState.options.layout.sidebar === 'left', '--sidebar left should be recorded')
  const leftMainWindow = await readFile(path.join(leftSidebarTarget, 'src', 'components', 'layout', 'MainWindow.tsx'), 'utf8')
  const leftTitleBar = await readFile(path.join(leftSidebarTarget, 'src', 'components', 'layout', 'LayoutTitleBar.tsx'), 'utf8')
  const leftUIStore = await readFile(path.join(leftSidebarTarget, 'src', 'store', 'ui-store.ts'), 'utf8')
  const leftUIStoreTest = await readFile(path.join(leftSidebarTarget, 'src', 'store', 'ui-store.test.ts'), 'utf8')
  assert(leftMainWindow.includes('LeftSideBar'), 'left sidebar layout should render the left sidebar')
  assert(!leftMainWindow.includes('RightSideBar'), 'left sidebar layout should not render the right sidebar')
  assert(leftTitleBar.includes('PanelLeft'), 'left sidebar layout should keep the left sidebar button')
  assert(!leftTitleBar.includes('PanelRight'), 'left sidebar layout should remove the right sidebar button')
  assert(leftUIStore.includes('leftSidebarVisible'), 'left sidebar layout should keep left sidebar store state')
  assert(!leftUIStore.includes('rightSidebarVisible'), 'left sidebar layout should remove right sidebar store state')
  assert(!leftUIStoreTest.includes('rightSidebarVisible'), 'left sidebar layout should remove right sidebar store tests')
  assert(!(await pathExists(path.join(leftSidebarTarget, 'src', 'components', 'layout', 'RightSideBar.tsx'))), 'left sidebar layout should remove the right sidebar component file')

  runCreateApp([
    '--name',
    'right-sidebar-demo',
    '--target',
    rightSidebarTarget,
    '--recipe',
    'desktop',
    '--sidebar',
    'right',
  ])

  const rightState = await readState(rightSidebarTarget)
  assert(rightState.options.layout.sidebar === 'right', '--sidebar right should be recorded')
  const rightMainWindow = await readFile(path.join(rightSidebarTarget, 'src', 'components', 'layout', 'MainWindow.tsx'), 'utf8')
  const rightTitleBar = await readFile(path.join(rightSidebarTarget, 'src', 'components', 'layout', 'LayoutTitleBar.tsx'), 'utf8')
  const rightUIStore = await readFile(path.join(rightSidebarTarget, 'src', 'store', 'ui-store.ts'), 'utf8')
  const rightUIStoreTest = await readFile(path.join(rightSidebarTarget, 'src', 'store', 'ui-store.test.ts'), 'utf8')
  assert(!rightMainWindow.includes('LeftSideBar'), 'right sidebar layout should not render the left sidebar')
  assert(rightMainWindow.includes('RightSideBar'), 'right sidebar layout should render the right sidebar')
  assert(!rightTitleBar.includes('PanelLeft'), 'right sidebar layout should remove the left sidebar button')
  assert(rightTitleBar.includes('PanelRight'), 'right sidebar layout should keep the right sidebar button')
  assert(!rightUIStore.includes('leftSidebarVisible'), 'right sidebar layout should remove left sidebar store state')
  assert(rightUIStore.includes('rightSidebarVisible'), 'right sidebar layout should keep right sidebar store state')
  assert(!rightUIStoreTest.includes('left sidebar visibility'), 'right sidebar layout should remove left sidebar store tests')
  assert(!(await pathExists(path.join(rightSidebarTarget, 'src', 'components', 'layout', 'LeftSideBar.tsx'))), 'right sidebar layout should remove the left sidebar component file')

  runCreateApp([
    '--name',
    'both-sidebar-demo',
    '--target',
    bothSidebarTarget,
    '--recipe',
    'desktop',
    '--sidebar',
    'both',
  ])

  const bothState = await readState(bothSidebarTarget)
  assert(bothState.options.layout.sidebar === 'both', '--sidebar both should be recorded')
  const bothMainWindow = await readFile(path.join(bothSidebarTarget, 'src', 'components', 'layout', 'MainWindow.tsx'), 'utf8')
  const bothUIStore = await readFile(path.join(bothSidebarTarget, 'src', 'store', 'ui-store.ts'), 'utf8')
  assert(bothMainWindow.includes('LeftSideBar'), 'both sidebar layout should render the left sidebar')
  assert(bothMainWindow.includes('RightSideBar'), 'both sidebar layout should render the right sidebar')
  assert(bothUIStore.includes('leftSidebarVisible'), 'both sidebar layout should keep left sidebar store state')
  assert(bothUIStore.includes('rightSidebarVisible'), 'both sidebar layout should keep right sidebar store state')

  const interactiveOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Interactive Demo',
      interactiveTarget,
      '2',
      '3',
      '1',
      'Wen',
      'com.example',
      '1200',
      '760',
      'MIT',
      '1',
      '',
    ].join('\n'),
  })

  assert(interactiveOutput.includes('Integration mode options:'), 'interactive mode should present integration mode choices')
  assert(interactiveOutput.includes('Recipe options:'), 'interactive recipe mode should present recipe choices')
  assert(interactiveOutput.includes('Sidebar layout options:'), 'interactive desktop recipe should present sidebar choices')

  const interactiveState = await readState(interactiveTarget)
  assert(interactiveState.integrationMode === 'recipe', 'interactive recipe mode should be recorded')
  assert(interactiveState.recipe === 'desktop', 'interactive should record the selected desktop recipe')
  assert(interactiveState.options.layout.sidebar === 'left', 'interactive should record the selected sidebar layout')
  const interactivePackage = await readJson(path.join(interactiveTarget, 'package.json'))
  assert(interactivePackage.name === 'interactive-demo', 'interactive mode should normalize the app package name')
  assert(interactivePackage.license === 'MIT', 'interactive mode should write the selected package license')

  runCreateApp([
    '--name',
    'pnpm-manager-demo',
    '--target',
    pnpmManagerTarget,
    '--recipe',
    'minimal',
    '--package-manager',
    'pnpm',
  ])

  const pnpmManagerPackage = await readJson(path.join(pnpmManagerTarget, 'package.json'))
  assert(pnpmManagerPackage.packageManager?.startsWith('pnpm@'), '--package-manager pnpm should pin pnpm')
  const pnpmManagerState = await readState(pnpmManagerTarget)
  assert(pnpmManagerState.packageManager === 'pnpm', '--package-manager pnpm should be recorded in scaffold state')

  runCreateApp([
    '--name',
    'pnpm-production-demo',
    '--target',
    pnpmProductionTarget,
    '--recipe',
    'production',
    '--package-manager',
    'pnpm',
  ])

  const pnpmProductionWorkflow = await readFile(
    path.join(pnpmProductionTarget, '.github', 'workflows', 'release.yml'),
    'utf8'
  )
  assert(
    pnpmProductionWorkflow.includes('cache: pnpm'),
    'pnpm generated release workflow should use pnpm dependency cache'
  )
  assert(
    pnpmProductionWorkflow.includes('corepack prepare pnpm@'),
    'pnpm generated release workflow should activate the pinned pnpm version'
  )
  assert(
    pnpmProductionWorkflow.includes('pnpm install --frozen-lockfile'),
    'pnpm generated release workflow should install through pnpm'
  )
  assert(
    pnpmProductionWorkflow.includes('pnpm run check:all'),
    'pnpm generated release workflow should run checks through pnpm'
  )
  assert(
    !/^\s*run: npm ci\s*$/m.test(pnpmProductionWorkflow) &&
      !/^\s*run: npm run check:all\s*$/m.test(pnpmProductionWorkflow),
    'pnpm generated release workflow should not leave npm release commands behind'
  )

  await mkdir(path.join(brokenFeatureDir, 'files'), { recursive: true })
  await writeFile(path.join(brokenFeatureDir, 'feature.json'), `${JSON.stringify({
    name: 'broken-readiness-test',
    description: 'Temporary broken feature for create-app atomicity tests.',
    stage: 'v1',
    dependsOn: [],
    conflictsWith: [],
    npmDependencies: [],
    cargoDependencies: [],
    files: [],
    tauriCommands: [],
    spectaExports: [],
    capabilities: [],
    qualityChecks: [],
    removeHints: [],
  }, null, 2)}\n`)
  await writeFile(path.join(brokenFeatureDir, 'markers.json'), `${JSON.stringify([
    {
      file: 'src/App.tsx',
      id: 'missing-marker',
      marker: 'TAURI_CREATOR:THIS_MARKER_DOES_NOT_EXIST',
      insert: 'const brokenReadinessTest = true',
    },
  ], null, 2)}\n`)

  let failed = false
  try {
    runCreateApp([
      '--name',
      'broken-readiness-demo',
      '--target',
      brokenTarget,
      '--features',
      'broken-readiness-test',
    ])
  } catch {
    failed = true
  }

  assert(failed, 'create-app should fail when feature marker preflight fails')
  assert(!(await pathExists(brokenTarget)), 'create-app should not leave a half-generated target on failure')
} finally {
  await rm(brokenFeatureDir, { recursive: true, force: true })
  await rm(tempRoot, { recursive: true, force: true })
}

console.log('create-app smoke test passed')
