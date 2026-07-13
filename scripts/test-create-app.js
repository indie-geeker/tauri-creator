import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
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
    input: options.input === undefined ? undefined : `${options.input}\n`,
    stdio: 'pipe',
  })
}

function spawnCreateApp(args, { detached = false } = {}) {
  const child = spawn(process.execPath, [createAppScript, ...args], {
    cwd: root,
    detached,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  const completed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, completed }
}

async function waitForStagingDirectory(appName, timeoutMs = 10000) {
  const prefix = `.tauri-creator-${appName}-`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await readdir(tempRoot)).some((entry) => entry.startsWith(prefix))) return prefix
    await delay(2)
  }
  throw new Error(`timed out waiting for staging directory '${prefix}'`)
}

async function waitForEnabledFeatures(appName, minimumCount, timeoutMs = 10000) {
  const prefix = `.tauri-creator-${appName}-`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const stagingEntry = (await readdir(tempRoot)).find((entry) => entry.startsWith(prefix))
    if (stagingEntry) {
      try {
        const state = await readJson(
          path.join(tempRoot, stagingEntry, '.tauri-creator.json')
        )
        if ((state.enabledFeatures?.length ?? 0) >= minimumCount) return prefix
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      }
    }
    await delay(2)
  }
  throw new Error(`timed out waiting for ${minimumCount} enabled features in '${prefix}'`)
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

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-create-app-'))
const minimalTarget = path.join(tempRoot, 'minimal-demo')
const starterTarget = path.join(tempRoot, 'starter-demo')
const fullTarget = path.join(tempRoot, 'full-demo')
const featureTarget = path.join(tempRoot, 'feature-demo')
const leftSidebarTarget = path.join(tempRoot, 'left-sidebar-demo')
const rightSidebarTarget = path.join(tempRoot, 'right-sidebar-demo')
const bothSidebarTarget = path.join(tempRoot, 'both-sidebar-demo')
const wizardStarterTarget = path.join(tempRoot, 'wizard-starter-demo')
const wizardMinimalTarget = path.join(tempRoot, 'wizard minimal demo')
const wizardFullTarget = path.join(tempRoot, 'wizard-full-demo')
const wizardExtrasTarget = path.join(tempRoot, 'wizard-extras-demo')
const wizardHiddenDependencyTarget = path.join(tempRoot, 'wizard-hidden-dependency-demo')
const wizardRetryTarget = path.join(tempRoot, 'wizard-retry-demo')
const wizardOccupiedTarget = path.join(tempRoot, 'wizard-occupied-demo')
const wizardBackTarget = path.join(tempRoot, 'wizard-back-demo')
const wizardCancelTarget = path.join(tempRoot, 'wizard-cancel-demo')
const wizardEofTarget = path.join(tempRoot, 'wizard-eof-demo')
const advancedAliasTarget = path.join(tempRoot, 'advanced-alias-demo')
const targetRaceTarget = path.join(tempRoot, 'target-race-demo')
const generationInterruptTarget = path.join(tempRoot, 'generation-interrupt-demo')
const invalidMetadataTarget = path.join(tempRoot, 'invalid-metadata-demo')
const pnpmManagerTarget = path.join(tempRoot, 'pnpm-manager-demo')
const pnpmFullTarget = path.join(tempRoot, 'pnpm-full-demo')
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

  for (const oldRecipeName of ['essential', 'desktop', 'production']) {
    const oldRecipeTarget = path.join(tempRoot, `${oldRecipeName}-removed-demo`)
    let oldRecipeFailed = false
    try {
      runCreateApp([
        '--name',
        `${oldRecipeName}-removed-demo`,
        '--target',
        oldRecipeTarget,
        '--recipe',
        oldRecipeName,
      ])
    } catch (error) {
      oldRecipeFailed = true
      assert(
        error.stderr?.toString('utf8').includes(`unknown recipe '${oldRecipeName}'`),
        `${oldRecipeName} should fail with unknown recipe guidance`
      )
    }
    assert(oldRecipeFailed, `${oldRecipeName} should no longer be accepted as a recipe`)
    assert(!(await pathExists(oldRecipeTarget)), `${oldRecipeName} failure should not create a target`)
  }

  runCreateApp([
    '--name',
    'starter-demo',
    '--target',
    starterTarget,
    '--recipe',
    'starter',
  ])

  const starterState = await readState(starterTarget)
  assert(
    starterState.enabledFeatures.join(',') === 'specta-bindings,preferences,logging,diagnostics',
    'starter should enable exactly the production foundation features'
  )
  for (const excludedFeature of ['dx-tools', 'quick-pane', 'sqlite', 'updater', 'project-governance']) {
    assert(
      !starterState.enabledFeatures.includes(excludedFeature),
      `starter should exclude ${excludedFeature}`
    )
  }
  assert(await pathExists(path.join(starterTarget, 'src-tauri', 'src', 'bindings.rs')), 'starter should include Specta bindings')
  assert(await pathExists(path.join(starterTarget, 'src', 'features', 'preferences', 'index.ts')), 'starter should include preferences')
  assert(await pathExists(path.join(starterTarget, 'src', 'lib', 'logger.ts')), 'starter should include logging')
  assert(await pathExists(path.join(starterTarget, 'src', 'features', 'diagnostics', 'index.ts')), 'starter should include diagnostics')

  runCreateApp([
    '--name',
    'full-demo',
    '--target',
    fullTarget,
    '--recipe',
    'full',
  ])

  const fullState = await readState(fullTarget)
  assert(fullState.integrationMode === 'recipe', 'full should use recipe integration mode')
  assert(fullState.recipe === 'full', 'full should record the selected recipe')
  assert(
    fullState.requestedFeatures.join(',') === [
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
    ].join(','),
    'full should preserve the explicit reference feature selection'
  )
  assert(
    fullState.enabledFeatures.join(',') === [
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
    ].join(','),
    'full should preserve the complete manifest-resolved reference output'
  )
  assert(await pathExists(path.join(fullTarget, 'src', 'components', 'layout', 'MainWindow.tsx')), 'full should include the layout shell')
  assert(await pathExists(path.join(fullTarget, 'src', 'features', 'sqlite', 'index.ts')), 'full should include sqlite')
  assert(await pathExists(path.join(fullTarget, 'src', 'features', 'updater', 'index.ts')), 'full should include updater')
  assert(await pathExists(path.join(fullTarget, 'docs', 'CONTRIBUTING.md')), 'full should include contributing docs')
  assert(await pathExists(path.join(fullTarget, 'docs', 'SECURITY.md')), 'full should include security docs')
  assert(await pathExists(path.join(fullTarget, 'LICENSE.md')), 'full should include license guidance')
  assert(await pathExists(path.join(fullTarget, '.ast-grep', 'rules')), 'full should include dx tools')
  const fullTauriConfig = await readFile(path.join(fullTarget, 'src-tauri', 'tauri.conf.json'), 'utf8')
  assert(!fullTauriConfig.includes('{{APP_NAME}}'), 'feature JSON patches should render app name placeholders')
  assert(
    fullTauriConfig.includes('https://github.com/full-demo/full-demo/releases/latest/download/latest.json'),
    'updater endpoint should use the generated app name'
  )
  const fullReleaseWorkflow = await readFile(path.join(fullTarget, '.github', 'workflows', 'release.yml'), 'utf8')
  assert(!fullReleaseWorkflow.includes('{{APP_TITLE}}'), 'feature files should render app title placeholders')
  assert(fullReleaseWorkflow.includes('name: Release Full Demo'), 'release workflow should use the generated product name')

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
    'full',
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
    'full',
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
    'full',
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

  const wizardStarterOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Starter Demo',
      wizardStarterTarget,
      '',
      '',
      '',
      'com.example',
      '',
      '',
    ].join('\n'),
  })

  assert(wizardStarterOutput.includes('Template options:'), 'wizard should present template choices')
  assert(!wizardStarterOutput.includes('Integration mode options:'), 'wizard should not expose integration modes')
  assert(
    !wizardStarterOutput.includes('] Custom titlebar —'),
    'wizard should hide capabilities that do not pass generated-app verification'
  )
  assert(!wizardStarterOutput.includes('] Preferences —'), 'wizard should hide preferences from the capability menu')
  assert(!wizardStarterOutput.includes('] Logging —'), 'wizard should hide logging from the capability menu')

  const wizardStarterState = await readState(wizardStarterTarget)
  assert(wizardStarterState.integrationMode === 'recipe', 'wizard should use recipe integration')
  assert(wizardStarterState.recipe === 'starter', 'Starter should be the default wizard template')
  assert(wizardStarterState.optionalFeatures.length === 0, 'Starter defaults should add no optional capability')
  assert(wizardStarterState.author === 'you', 'wizard defaults should use the default author')
  assert(wizardStarterState.license === 'UNLICENSED', 'wizard defaults should use the default license')
  assert(wizardStarterState.window.width === 1000, 'wizard defaults should use the default width')
  assert(wizardStarterState.window.height === 700, 'wizard defaults should use the default height')

  const wizardMinimalOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Minimal Demo',
      wizardMinimalTarget,
      '1',
      '',
      '',
      '',
      '',
      '',
    ].join('\n'),
  })
  const wizardMinimalState = await readState(wizardMinimalTarget)
  assert(wizardMinimalState.recipe === 'minimal', 'wizard should generate the Minimal template')
  assert(wizardMinimalState.resolvedFeatures.length === 0, 'Minimal should resolve no features by default')
  assert(
    wizardMinimalOutput.includes(`Next: cd '${wizardMinimalTarget}' && npm install`),
    'next-step command should quote target paths that contain spaces'
  )

  const wizardFullOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Full Demo',
      wizardFullTarget,
      '3',
      '',
      'com.example',
      '2',
      'Wen',
      'MIT',
      '1200',
      '760',
      '1',
      '',
    ].join('\n'),
  })
  assert(wizardFullOutput.includes('Sidebar layout options:'), 'Full advanced settings should offer sidebar layout')
  const wizardFullState = await readState(wizardFullTarget)
  assert(wizardFullState.recipe === 'full', 'wizard should generate the Full regression recipe')
  assert(wizardFullState.options.layout.sidebar === 'left', 'wizard should record an advanced sidebar override')
  assert(wizardFullState.author === 'Wen', 'wizard should record an advanced author override')
  assert(wizardFullState.license === 'MIT', 'wizard should record an advanced license override')
  assert(wizardFullState.window.width === 1200, 'wizard should record an advanced width override')
  assert(wizardFullState.window.height === 760, 'wizard should record an advanced height override')

  const wizardExtrasOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Extras Demo',
      wizardExtrasTarget,
      '',
      '2',
      '7,10',
      '',
      '',
      '',
      '',
    ].join('\n'),
  })
  const wizardExtrasState = await readState(wizardExtrasTarget)
  assert(
    wizardExtrasState.optionalFeatures.join(',') === 'sqlite,updater',
    'wizard should record SQLite and Updater as optional capabilities'
  )
  assert(
    wizardExtrasState.resolvedFeatures.includes('project-governance'),
    'Updater should automatically resolve Project governance'
  )
  assert(
    wizardExtrasOutput.includes('Automatic dependencies: app-state, project-governance'),
    'wizard summary should disclose automatically resolved dependencies'
  )

  const wizardHiddenDependencyOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Hidden Dependency Demo',
      wizardHiddenDependencyTarget,
      '1',
      '2',
      '4',
      '',
      '',
      '',
      '',
    ].join('\n'),
  })
  const wizardHiddenDependencyState = await readState(wizardHiddenDependencyTarget)
  assert(
    wizardHiddenDependencyState.optionalFeatures.join(',') === 'quick-pane',
    'wizard should record Quick pane as the requested capability'
  )
  assert(
    wizardHiddenDependencyState.resolvedFeatures.join(',') === 'preferences,quick-pane',
    'wizard should automatically resolve hidden Preferences for Quick pane'
  )
  assert(
    wizardHiddenDependencyOutput.includes('Automatic dependencies: preferences'),
    'summary should disclose a hidden automatically resolved dependency'
  )
  assert(
    !wizardHiddenDependencyOutput.includes('] Preferences —'),
    'hidden dependencies should never appear as selectable capabilities'
  )

  await mkdir(wizardOccupiedTarget, { recursive: true })
  await writeFile(path.join(wizardOccupiedTarget, 'keep.txt'), 'preserve me\n')
  const wizardRetryOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      '---',
      'Wizard Retry Demo',
      wizardOccupiedTarget,
      wizardRetryTarget,
      '',
      '',
      '',
      'not valid',
      'org.example',
      '2',
      'Wen\\q',
      'Wen',
      'MIT\\q',
      'MIT',
      '100',
      '1200',
      '760',
      '',
    ].join('\n'),
  })
  assert(wizardRetryOutput.includes('Project name must contain'), 'invalid names should be retried')
  assert(wizardRetryOutput.includes('Target directory must be empty'), 'non-empty targets should be retried')
  assert(wizardRetryOutput.includes('reverse-DNS segments'), 'invalid bundle prefixes should be retried')
  assert(wizardRetryOutput.includes('integer between 320 and 10000'), 'invalid dimensions should be retried')
  assert(await pathExists(path.join(wizardOccupiedTarget, 'keep.txt')), 'target retry must preserve existing content')
  const wizardRetryState = await readState(wizardRetryTarget)
  assert(wizardRetryState.author === 'Wen', 'corrected author values should be used')
  assert(wizardRetryState.license === 'MIT', 'corrected license values should be used')
  assert(wizardRetryState.window.width === 1200, 'corrected advanced values should be used')
  assert(
    wizardRetryOutput.includes('cannot contain control characters, quotes, or backslashes'),
    'unsafe metadata should be explained and retried'
  )

  for (const [option, value] of [
    ['--author', 'Wen\\q'],
    ['--license', 'MIT\\q'],
    ['--license', 'MIT\tOR'],
    ['--license', 'MIT\u007fOR'],
  ]) {
    let invalidMetadataFailed = false
    try {
      runCreateApp([
        '--name',
        'invalid-metadata-demo',
        '--target',
        invalidMetadataTarget,
        '--recipe',
        'minimal',
        option,
        value,
      ], { encoding: 'utf8' })
    } catch (error) {
      invalidMetadataFailed = true
      assert(
        error.stderr?.includes('cannot contain control characters, quotes, or backslashes'),
        `${option} should explain unsafe template metadata`
      )
    }
    assert(invalidMetadataFailed, `${option} should reject unsafe template metadata`)
    assert(!(await pathExists(invalidMetadataTarget)), `${option} failure should not create a target`)
  }

  const wizardBackOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Back Demo',
      wizardBackTarget,
      '3',
      '',
      '',
      '',
      '2',
      '1',
      '',
      '',
      '',
      '',
      '1',
    ].join('\n'),
  })
  assert(
    wizardBackOutput.match(/Template options:/g)?.length === 2,
    'Back should return to template selection'
  )
  assert((await readState(wizardBackTarget)).recipe === 'minimal', 'Back should replace the first template choice')

  const wizardCancelOutput = runCreateApp([], {
    encoding: 'utf8',
    input: [
      'Wizard Cancel Demo',
      wizardCancelTarget,
      '',
      '',
      '',
      '',
      '',
      '3',
    ].join('\n'),
  })
  assert(wizardCancelOutput.includes('Creation cancelled.'), 'Cancel should produce a concise confirmation')
  assert(!(await pathExists(wizardCancelTarget)), 'Cancel should not create the target')

  const wizardEofOutput = runCreateApp([], {
    encoding: 'utf8',
    input: ['Wizard EOF Demo', wizardEofTarget].join('\n'),
  })
  assert(wizardEofOutput.includes('Creation cancelled.'), 'EOF should cancel cleanly')
  assert(!(await pathExists(wizardEofTarget)), 'EOF should not create the target')
  assert(
    !(await readdir(tempRoot)).some((entry) => entry.startsWith('.tauri-creator-')),
    'cancelled wizards should not leave staging directories'
  )

  const advancedAliasOutput = runCreateApp(['--advanced'], {
    encoding: 'utf8',
    input: [
      'Advanced Alias Demo',
      advancedAliasTarget,
      '1',
      '',
      '',
      '',
      '',
      '',
    ].join('\n'),
  })
  assert(advancedAliasOutput.includes('Template options:'), '--advanced should open the unified wizard')
  assert(!advancedAliasOutput.includes('Integration mode options:'), '--advanced should not expose manual composition')
  assert((await readState(advancedAliasTarget)).recipe === 'minimal', '--advanced should retain template selection')

  for (const [caseName, extraArgs] of [
    ['recipe', ['--recipe', 'starter']],
    ['features', ['--features', 'logging']],
    ['identity', ['--name', 'ambiguous-demo']],
    ['configuration', ['--author', 'Wen']],
  ]) {
    const ambiguousTarget = path.join(tempRoot, `advanced-${caseName}-ambiguity`)
    let ambiguityFailed = false
    try {
      runCreateApp(['--advanced', '--target', ambiguousTarget, ...extraArgs], {
        encoding: 'utf8',
        input: '',
      })
    } catch (error) {
      ambiguityFailed = true
      assert(
        error.stderr?.includes('--advanced cannot be combined'),
        `advanced ${caseName} ambiguity should explain the invalid combination`
      )
    }
    assert(ambiguityFailed, `advanced should reject ${caseName} options`)
    assert(!(await pathExists(ambiguousTarget)), `advanced ${caseName} ambiguity should not create a target`)
  }

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
    'pnpm-full-demo',
    '--target',
    pnpmFullTarget,
    '--recipe',
    'full',
    '--package-manager',
    'pnpm',
  ])

  const pnpmFullWorkflow = await readFile(
    path.join(pnpmFullTarget, '.github', 'workflows', 'release.yml'),
    'utf8'
  )
  assert(
    pnpmFullWorkflow.includes('cache: pnpm'),
    'pnpm generated release workflow should use pnpm dependency cache'
  )
  assert(
    pnpmFullWorkflow.includes('corepack prepare pnpm@'),
    'pnpm generated release workflow should activate the pinned pnpm version'
  )
  assert(
    pnpmFullWorkflow.includes('pnpm install --frozen-lockfile'),
    'pnpm generated release workflow should install through pnpm'
  )
  assert(
    pnpmFullWorkflow.includes('pnpm run check:all'),
    'pnpm generated release workflow should run checks through pnpm'
  )
  assert(
    !/^\s*run: npm ci\s*$/m.test(pnpmFullWorkflow) &&
      !/^\s*run: npm run check:all\s*$/m.test(pnpmFullWorkflow),
    'pnpm generated release workflow should not leave npm release commands behind'
  )

  await mkdir(targetRaceTarget, { recursive: true })
  const targetRaceRun = spawnCreateApp([
    '--name',
    'target-race-demo',
    '--target',
    targetRaceTarget,
    '--recipe',
    'full',
  ])
  const targetRaceStagingPrefix = await waitForStagingDirectory('target-race-demo')
  const targetRaceSentinel = path.join(targetRaceTarget, 'keep.txt')
  await writeFile(targetRaceSentinel, 'do not delete\n')
  const targetRaceResult = await targetRaceRun.completed
  assert(targetRaceResult.code !== 0, 'create-app should fail if an empty target changes during generation')
  assert(
    await pathExists(targetRaceSentinel),
    'create-app must preserve files concurrently added to the target'
  )
  assert(
    !(await readdir(tempRoot)).some((entry) => entry.startsWith(targetRaceStagingPrefix)),
    'a target publication race should still clean its staging directory'
  )

  const generationInterruptRun = spawnCreateApp([
    '--name',
    'generation-interrupt-demo',
    '--target',
    generationInterruptTarget,
    '--recipe',
    'full',
  ], { detached: true })
  const generationInterruptStagingPrefix = await waitForEnabledFeatures(
    'generation-interrupt-demo',
    5
  )
  process.kill(-generationInterruptRun.child.pid, 'SIGINT')
  const generationInterruptResult = await generationInterruptRun.completed
  assert(
    generationInterruptResult.code === 130,
    'SIGINT should stop generation with exit code 130'
  )
  assert(
    generationInterruptResult.stderr.includes('generation interrupted by SIGINT'),
    'SIGINT should report a concise interruption message instead of a child-process failure'
  )
  assert(!(await pathExists(generationInterruptTarget)), 'SIGINT should not publish the target')
  assert(
    !(await readdir(tempRoot)).some(
      (entry) => entry.startsWith(generationInterruptStagingPrefix)
    ),
    'SIGINT during generation should clean its staging directory'
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
    wizard: { visible: false },
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
