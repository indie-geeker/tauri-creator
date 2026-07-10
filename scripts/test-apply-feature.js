import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const createAppScript = path.join(root, 'scripts', 'create-app.js')
const applyFeatureScript = path.join(root, 'scripts', 'apply-feature.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertImportCount(source, importStatement, expectedCount, message) {
  const escapedImport = importStatement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = source.match(new RegExp(escapedImport, 'g')) ?? []
  assert(
    matches.length === expectedCount,
    `${message}: expected ${expectedCount}, got ${matches.length}`
  )
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

function runNode(script, args) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-apply-feature-'))
const target = path.join(tempRoot, 'demo')
const conflictTarget = path.join(tempRoot, 'conflict-demo')
const templateTarget = path.join(tempRoot, 'template-demo')
const pnpmTemplateTarget = path.join(tempRoot, 'pnpm-template-demo')
const invalidStateTarget = path.join(tempRoot, 'invalid-state-demo')

try {
  runNode(createAppScript, [
    '--name',
    'demo',
    '--target',
    target,
    '--recipe',
    'minimal',
  ])

  runNode(createAppScript, [
    '--name',
    'conflict-demo',
    '--target',
    conflictTarget,
    '--recipe',
    'minimal',
  ])
  await mkdir(path.join(conflictTarget, 'src', 'features', 'preferences'), { recursive: true })
  await writeFile(
    path.join(conflictTarget, 'src', 'features', 'preferences', 'index.ts'),
    'export const userFile = true\n'
  )
  let conflictFailed = false
  let conflictError = ''
  try {
    runNode(applyFeatureScript, [
      '--target',
      conflictTarget,
      '--feature',
      'preferences',
    ])
  } catch (error) {
    conflictFailed = true
    conflictError = error.stderr?.toString('utf8') ?? ''
  }
  assert(conflictFailed, 'apply-feature should fail before overwriting a non-base user file')
  assert(
    conflictError.includes("would overwrite existing file 'src/features/preferences/index.ts'"),
    'apply-feature should report the conflicting file path'
  )

  runNode(createAppScript, [
    '--name',
    'Template Demo',
    '--target',
    templateTarget,
    '--recipe',
    'minimal',
  ])
  const businessTemplatePath = path.join(templateTarget, 'src', 'business-template.txt')
  const businessTemplate = "const literal = '{{APP_NAME}}'\n"
  await writeFile(businessTemplatePath, businessTemplate)

  runNode(applyFeatureScript, [
    '--target',
    templateTarget,
    '--feature',
    'updater',
  ])

  const appliedUpdaterConfig = await readFile(
    path.join(templateTarget, 'src-tauri', 'tauri.conf.json'),
    'utf8'
  )
  const appliedReleaseWorkflow = await readFile(
    path.join(templateTarget, '.github', 'workflows', 'release.yml'),
    'utf8'
  )
  assert(
    !appliedUpdaterConfig.includes('{{APP_NAME}}') &&
      appliedUpdaterConfig.includes(
        'https://github.com/template-demo/template-demo/releases/latest/download/latest.json'
      ),
    'post-create updater application should render the generated package name'
  )
  assert(
    !appliedReleaseWorkflow.includes('{{APP_TITLE}}') &&
      !appliedReleaseWorkflow.includes('{{PACKAGE_MANAGER}}') &&
      !appliedReleaseWorkflow.includes('{{PACKAGE_MANAGER_INSTALL_COMMAND}}'),
    'post-create updater application should render release workflow placeholders'
  )
  assert(
    appliedReleaseWorkflow.includes('name: Release Template Demo') &&
      appliedReleaseWorkflow.includes('run: npm ci') &&
      appliedReleaseWorkflow.includes('run: npm run check:all'),
    'post-create updater application should render npm release commands'
  )
  assert(
    await readFile(businessTemplatePath, 'utf8') === businessTemplate,
    'applying a feature should not render placeholders in unrelated business files'
  )

  runNode(createAppScript, [
    '--name',
    'Pnpm Template Demo',
    '--target',
    pnpmTemplateTarget,
    '--recipe',
    'minimal',
    '--package-manager',
    'pnpm',
  ])
  runNode(applyFeatureScript, [
    '--target',
    pnpmTemplateTarget,
    '--feature',
    'updater',
  ])
  const appliedPnpmWorkflow = await readFile(
    path.join(pnpmTemplateTarget, '.github', 'workflows', 'release.yml'),
    'utf8'
  )
  assert(
    appliedPnpmWorkflow.includes('corepack prepare pnpm@') &&
      appliedPnpmWorkflow.includes('pnpm install --frozen-lockfile') &&
      appliedPnpmWorkflow.includes('pnpm run check:all'),
    'post-create updater application should render pinned pnpm release commands'
  )

  runNode(createAppScript, [
    '--name',
    'Invalid State Demo',
    '--target',
    invalidStateTarget,
    '--recipe',
    'minimal',
  ])
  const invalidStatePath = path.join(invalidStateTarget, '.tauri-creator.json')
  const invalidState = JSON.parse(await readFile(invalidStatePath, 'utf8'))
  delete invalidState.packageManagerSpec
  await writeFile(invalidStatePath, `${JSON.stringify(invalidState, null, 2)}\n`)
  const projectMapBeforeInvalidApply = await readFile(
    path.join(invalidStateTarget, 'PROJECT_MAP.md'),
    'utf8'
  )
  let invalidStateFailed = false
  let invalidStateError = ''
  try {
    runNode(applyFeatureScript, [
      '--target',
      invalidStateTarget,
      '--feature',
      'updater',
    ])
  } catch (error) {
    invalidStateFailed = true
    invalidStateError = error.stderr?.toString('utf8') ?? ''
  }
  assert(invalidStateFailed, 'apply-feature should reject missing template state before mutation')
  assert(
    invalidStateError.includes('packageManagerSpec'),
    'apply-feature should name the missing template state field'
  )
  assert(
    !(await pathExists(path.join(invalidStateTarget, 'src', 'features', 'updater', 'index.ts'))),
    'invalid template state should fail before copying updater files'
  )
  assert(
    !(await pathExists(path.join(invalidStateTarget, '.github', 'workflows', 'release.yml'))),
    'invalid template state should fail before copying dependency feature files'
  )
  const invalidStateAfterApply = JSON.parse(await readFile(invalidStatePath, 'utf8'))
  assert(
    invalidStateAfterApply.enabledFeatures.length === 0,
    'invalid template state should fail before updating enabled features'
  )
  assert(
    await readFile(path.join(invalidStateTarget, 'PROJECT_MAP.md'), 'utf8') ===
      projectMapBeforeInvalidApply,
    'invalid template state should fail before updating PROJECT_MAP.md'
  )

  const dryRunOutput = runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'preferences',
    '--dry-run',
  ])
  assert(
    dryRunOutput.includes('Dry run: would apply features: preferences'),
    'apply-feature dry-run should report planned features'
  )
  assert(
    !(await pathExists(path.join(target, 'src', 'features', 'preferences', 'index.ts'))),
    'apply-feature dry-run should not copy feature files'
  )
  const dryRunState = JSON.parse(await readFile(path.join(target, '.tauri-creator.json'), 'utf8'))
  assert(
    !dryRunState.enabledFeatures.includes('preferences'),
    'apply-feature dry-run should not update enabled feature state'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'preferences',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'features', 'preferences', 'index.ts')),
    'preferences source file should be copied'
  )

  const packageJson = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
  assert(
    packageJson.dependencies['@tanstack/react-query'] === '^5.90.12',
    'package.json should merge feature dependencies'
  )

  const libSource = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    libSource.includes('features::preferences::load_preferences'),
    'lib.rs should receive marker insertion'
  )

  const defaultCapability = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    !defaultCapability.permissions.includes('preferences:default'),
    'default capability should not include undefined placeholder feature permissions'
  )

  const rustLib = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    rustLib.includes('pub mod preferences;'),
    'Rust lib.rs should register the preferences module'
  )
  assert(
    rustLib.includes('    // TAURI_CREATOR:FEATURE_START preferences:preferences-rust-module'),
    'Rust marker block comments should preserve marker indentation'
  )
  assert(
    rustLib.includes('features::preferences::load_preferences'),
    'Rust lib.rs should register the preferences command'
  )

  const preferencesRustSource = await readFile(
    path.join(target, 'src-tauri', 'src', 'features', 'preferences.rs'),
    'utf8'
  )
  assert(
    preferencesRustSource.includes('app_data_dir()'),
    'preferences Rust source should resolve the Tauri app data directory'
  )
  assert(
    preferencesRustSource.includes('path.with_extension("tmp")'),
    'preferences Rust source should write through a temp file before rename'
  )
  assert(
    preferencesRustSource.includes('std::fs::rename(&temp_path, path)'),
    'preferences Rust source should atomically finalize saved preferences'
  )
  assert(
    preferencesRustSource.includes('invalid theme'),
    'preferences Rust source should validate known theme values'
  )
  assert(
    preferencesRustSource.includes('Result<PreferencesSnapshot, String>'),
    'preferences Tauri commands should return Result snapshots'
  )

  const preferencesDocs = await readFile(
    path.join(target, 'docs', 'features', 'preferences.md'),
    'utf8'
  )
  assert(
    preferencesDocs.includes('app data JSON file'),
    'preferences docs should describe persisted app-data JSON behavior'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'app-lifecycle',
  ])

  const rustLibAfterLifecycle = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    rustLibAfterLifecycle.includes('tauri::RunEvent::WindowEvent'),
    'app-lifecycle should hook Tauri window events'
  )
  assert(
    rustLibAfterLifecycle.includes('tauri::WindowEvent::CloseRequested'),
    'app-lifecycle should handle main window close requests'
  )
  assert(
    rustLibAfterLifecycle.includes('api.prevent_close()'),
    'app-lifecycle should prevent close on macOS before hiding the main window'
  )
  assert(
    rustLibAfterLifecycle.includes('window.hide()'),
    'app-lifecycle should hide the main window on macOS close'
  )
  assert(
    rustLibAfterLifecycle.includes('tauri::RunEvent::Reopen'),
    'app-lifecycle should handle macOS dock reopen events'
  )
  assert(
    rustLibAfterLifecycle.includes('window.show()'),
    'app-lifecycle should show the main window on dock reopen'
  )
  assert(
    rustLibAfterLifecycle.includes('window.set_focus()'),
    'app-lifecycle should focus the main window on dock reopen'
  )
  assert(
    rustLibAfterLifecycle.includes('Application exiting; running lifecycle cleanup hooks'),
    'app-lifecycle should insert an exit cleanup hook'
  )

  const cargoTomlAfterLifecycle = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    cargoTomlAfterLifecycle.includes('log = "0.4"'),
    'app-lifecycle should add the Rust log facade for lifecycle events'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'logging',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'lib', 'logger.ts')),
    'logging should copy the frontend logger wrapper'
  )
  const loggingFrontendSource = await readFile(
    path.join(target, 'src', 'lib', 'logger.ts'),
    'utf8'
  )
  assert(
    loggingFrontendSource.includes("from '@tauri-apps/plugin-log'"),
    'logging frontend wrapper should send logs through the Tauri log guest binding'
  )
  assert(
    loggingFrontendSource.includes('serializeContext'),
    'logging frontend wrapper should serialize structured context safely'
  )

  const packageJsonAfterLogging = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
  assert(
    packageJsonAfterLogging.dependencies['@tauri-apps/plugin-log'] === '^2.8.0',
    'logging should add the Tauri log frontend package'
  )

  const cargoTomlAfterLogging = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    cargoTomlAfterLogging.includes('tauri-plugin-log = "2"'),
    'logging should add the Tauri log Rust plugin'
  )
  assert(
    cargoTomlAfterLogging.includes('log = "0.4"'),
    'logging should add the Rust log facade'
  )

  const rustLibAfterLogging = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    rustLibAfterLogging.includes('tauri_plugin_log::TargetKind::Stdout'),
    'logging should register stdout logging for development'
  )
  assert(
    rustLibAfterLogging.includes('tauri_plugin_log::TargetKind::LogDir'),
    'logging should register macOS log directory logging'
  )
  assert(
    rustLibAfterLogging.includes('#[cfg(not(target_os = "linux"))]'),
    'logging should avoid webview logging on Linux'
  )
  assert(
    rustLibAfterLogging.includes('log::LevelFilter::Debug'),
    'logging should use Debug level for debug builds'
  )
  assert(
    rustLibAfterLogging.includes('log::LevelFilter::Info'),
    'logging should use Info level for release builds'
  )

  const capabilityAfterLogging = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    capabilityAfterLogging.permissions.includes('log:default'),
    'logging should enable the default log capability for frontend guest bindings'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'sqlite',
  ])

  const cargoToml = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    cargoToml.includes('rusqlite = { version = "0.32", features = ["bundled"] }'),
    'Cargo.toml should merge feature cargo dependencies'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'quick-pane',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'features', 'quick-pane', 'index.tsx')),
    'quick-pane source file should be copied'
  )
  assert(
    await pathExists(path.join(target, 'src-tauri', 'src', 'features', 'quick_pane.rs')),
    'quick-pane Rust file should be copied'
  )
  assert(
    await pathExists(path.join(target, 'quick-pane.html')),
    'quick-pane should copy a secondary window HTML entry'
  )
  assert(
    await pathExists(path.join(target, 'src', 'quick-pane-main.tsx')),
    'quick-pane should copy a secondary window React entry'
  )

  const packageJsonAfterQuickPane = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
  assert(
    !packageJsonAfterQuickPane.dependencies['@tauri-apps/plugin-global-shortcut'],
    'quick-pane should register shortcuts in Rust instead of using the frontend guest binding'
  )

  const cargoTomlAfterQuickPane = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    cargoTomlAfterQuickPane.includes('tauri-plugin-global-shortcut = "2.3.2"'),
    'Cargo.toml should merge the global shortcut Rust plugin'
  )
  assert(
    cargoTomlAfterQuickPane.includes('tauri = { version = "2", features = ["macos-private-api"] }'),
    'Cargo.toml should enable the macos-private-api feature for NSPanel support'
  )
  assert(
    cargoTomlAfterQuickPane.includes('[target.\'cfg(target_os = "macos")\'.dependencies]'),
    'Cargo.toml should add a macOS-only dependency section for NSPanel support'
  )
  assert(
    cargoTomlAfterQuickPane.includes('tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }'),
    'Cargo.toml should merge the macOS-only tauri-nspanel dependency'
  )

  const tauriConfigAfterQuickPane = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'tauri.conf.json'), 'utf8')
  )
  assert(
    tauriConfigAfterQuickPane.app.macOSPrivateApi === true,
    'tauri.conf.json should allow macOS private API when NSPanel support is enabled'
  )

  const quickPaneRustSource = await readFile(
    path.join(target, 'src-tauri', 'src', 'features', 'quick_pane.rs'),
    'utf8'
  )
  assert(
    quickPaneRustSource.includes('cursor_position()'),
    'quick-pane Rust source should read the cursor position before showing the pane'
  )
  assert(
    quickPaneRustSource.includes('monitor_from_point(cursor_pos.x, cursor_pos.y)'),
    'quick-pane Rust source should find the monitor containing the cursor'
  )
  assert(
    quickPaneRustSource.includes('position_quick_pane_on_cursor_monitor(app)?;'),
    'quick-pane Rust source should reposition the pane on the cursor monitor before showing it'
  )
  assert(
    quickPaneRustSource.includes('tauri_panel!'),
    'quick-pane Rust source should define an NSPanel class on macOS'
  )
  assert(
    quickPaneRustSource.includes('PanelBuilder::<_, QuickPanePanel>::new'),
    'quick-pane Rust source should build an NSPanel on macOS'
  )
  assert(
    quickPaneRustSource.includes('show_and_make_key()'),
    'quick-pane Rust source should make the NSPanel key when shown'
  )

  const quickPaneFrontendSource = await readFile(
    path.join(target, 'src', 'features', 'quick-pane', 'index.tsx'),
    'utf8'
  )
  assert(
    quickPaneFrontendSource.includes('listen<QuickPaneSubmitPayload>(QUICK_PANE_SUBMIT_EVENT'),
    'main window quick-pane panel should listen for quick-pane-submit events'
  )
  assert(
    quickPaneFrontendSource.includes('quick-pane-submissions'),
    'main window quick-pane panel should render a lightweight submission record'
  )
  assert(
    quickPaneFrontendSource.includes('getCurrentWindow'),
    'secondary quick-pane window should inspect its own focus state'
  )
  assert(
    quickPaneFrontendSource.includes('onFocusChanged'),
    'secondary quick-pane window should dismiss itself when focus is lost'
  )
  const appSourceAfterQuickPane = await readFile(path.join(target, 'src', 'App.tsx'), 'utf8')
  assert(
    !appSourceAfterQuickPane.includes('QuickPanePanel'),
    'quick-pane should not render a main-window control panel by default'
  )

  const quickPaneRustLib = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    quickPaneRustLib.includes('tauri_plugin_global_shortcut::Builder::new().build()'),
    'Rust lib.rs should register the global shortcut plugin in setup'
  )
  assert(
    quickPaneRustLib.includes('features::quick_pane::register_saved_or_default_quick_pane_shortcut(app.handle())'),
    'Rust setup should register the saved or default quick-pane shortcut through the backend'
  )
  assert(
    quickPaneRustLib.includes('tauri_nspanel::init()'),
    'Rust setup should initialize the tauri-nspanel plugin before creating an NSPanel'
  )
  assert(
    quickPaneRustLib.includes('features::quick_pane::init_quick_pane_window(app.handle())'),
    'Rust setup should initialize the secondary quick-pane window'
  )
  assert(
    quickPaneRustLib.includes('pub mod quick_pane;'),
    'Rust lib.rs should register the quick-pane module'
  )
  assert(
    quickPaneRustLib.includes('features::quick_pane::get_quick_pane_state'),
    'Rust lib.rs should register the quick-pane state command'
  )
  assert(
    quickPaneRustLib.includes('features::quick_pane::get_default_quick_pane_shortcut'),
    'Rust lib.rs should register the default quick-pane shortcut command'
  )
  assert(
    quickPaneRustLib.includes('features::quick_pane::toggle_quick_pane'),
    'Rust lib.rs should register the quick-pane toggle command'
  )

  const quickPaneCapability = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    quickPaneCapability.windows.includes('quick-pane'),
    'default capability should include the secondary quick-pane window'
  )
  assert(
    quickPaneCapability.permissions.includes('core:event:default'),
    'default capability should allow quick-pane state events'
  )
  assert(
    !quickPaneCapability.permissions.includes('global-shortcut:allow-register'),
    'default capability should not expose global shortcut registration to frontend JavaScript'
  )

  const quickPaneViteConfig = await readFile(path.join(target, 'vite.config.ts'), 'utf8')
  assert(
    quickPaneViteConfig.includes("quickPane: resolve(__dirname, 'quick-pane.html')"),
    'Vite config should build the secondary quick-pane HTML entry'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'specta-bindings',
  ])

  const spectaLib = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    spectaLib.includes('mod bindings;'),
    'specta-bindings should register bindings.rs as a root Rust module'
  )
  assert(
    !spectaLib.includes('pub mod bindings;'),
    'specta-bindings should not register bindings.rs inside the features module'
  )
  assert(
    spectaLib.includes('builder.invoke_handler()'),
    'specta-bindings should replace generate_handler with builder.invoke_handler()'
  )

  const spectaBindingsTs = await readFile(path.join(target, 'src-tauri', 'src', 'bindings.rs'), 'utf8')
  assert(
    spectaBindingsTs.includes('quick_pane::show_quick_pane'),
    'specta-bindings should inject commands from applied features into bindings.rs'
  )
  assert(
    spectaBindingsTs.includes('use crate::infrastructure::database;'),
    'specta-bindings should use explicit manifest module paths for infrastructure commands'
  )
  assert(
    spectaBindingsTs.includes('database::get_database_health,'),
    'specta-bindings should export sqlite commands through the infrastructure database module'
  )
  assert(
    !spectaBindingsTs.includes('use crate::features::sqlite;'),
    'specta-bindings should not infer non-existent feature modules from feature names'
  )
  const packageJsonAfterSpecta = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
  assert(
    packageJsonAfterSpecta.scripts['rust:bindings'] === 'cd src-tauri && cargo test export_bindings -- --ignored --nocapture',
    'specta-bindings should add a rust:bindings script to generated apps'
  )
  
  const quickPaneRustSourceWithSpecta = await readFile(
    path.join(target, 'src-tauri', 'src', 'features', 'quick_pane.rs'),
    'utf8'
  )
  assert(
    quickPaneRustSourceWithSpecta.includes('#[specta::specta]'),
    'specta-bindings should inject #[specta::specta] into feature files'
  )
  const preferencesRustSourceWithSpecta = await readFile(
    path.join(target, 'src-tauri', 'src', 'features', 'preferences.rs'),
    'utf8'
  )
  assert(
    preferencesRustSourceWithSpecta.includes('specta::Type'),
    'specta-bindings should derive specta::Type for exported preference types'
  )
  const databaseRustSourceWithSpecta = await readFile(
    path.join(target, 'src-tauri', 'src', 'infrastructure', 'database', 'mod.rs'),
    'utf8'
  )
  assert(
    databaseRustSourceWithSpecta.includes('specta::Type'),
    'specta-bindings should derive specta::Type for exported infrastructure types'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'dx-tools',
  ])

  assert(
    await pathExists(path.join(target, '.ast-grep', 'rules')),
    'dx-tools should copy .ast-grep rules'
  )
  assert(
    await pathExists(path.join(target, 'eslint.config.js')),
    'dx-tools should copy eslint.config.js'
  )
  const packageJsonAfterDxTools = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
  assert(
    packageJsonAfterDxTools.scripts['check:all'] !== undefined,
    'dx-tools should inject check:all script'
  )
  assert(
    packageJsonAfterDxTools.scripts['rust:fmt'] ===
      'cargo fmt --manifest-path src-tauri/Cargo.toml',
    'dx-tools rust:fmt should work without a POSIX shell profile'
  )
  assert(
    packageJsonAfterDxTools.scripts['rust:clippy'] ===
      'cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings',
    'dx-tools rust:clippy should work without a POSIX shell profile'
  )
  for (const [scriptName, command] of Object.entries(packageJsonAfterDxTools.scripts)) {
    assert(
      !command.includes('source ~/.cargo/env'),
      `dx-tools ${scriptName} should not depend on source or ~/.cargo/env`
    )
  }
  assert(
    packageJsonAfterDxTools.scripts['check:all'].includes(
      'cargo clippy --manifest-path src-tauri/Cargo.toml'
    ),
    'dx-tools check:all should retain the Rust clippy gate'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'ui-tailwind',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'tailwind.css')),
    'ui-tailwind should copy tailwind.css'
  )
  const uiTailwindViteConfig = await readFile(path.join(target, 'vite.config.ts'), 'utf8')
  assert(
    uiTailwindViteConfig.includes('tailwindcss()'),
    'ui-tailwind should inject tailwindcss() into vite.config.ts'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'app-state',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'store')),
    'app-state should copy store'
  )
  const appStateMainTsx = await readFile(path.join(target, 'src', 'main.tsx'), 'utf8')
  assert(
    appStateMainTsx.includes('<QueryClientProvider client={queryClient}>'),
    'app-state should inject QueryClientProvider into main.tsx'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'custom-titlebar',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'components', 'titlebar')),
    'custom-titlebar should copy components'
  )
  const customTitlebarAppTsx = await readFile(path.join(target, 'src', 'App.tsx'), 'utf8')
  assert(
    customTitlebarAppTsx.includes('<Titlebar />'),
    'custom-titlebar should inject Titlebar into App.tsx'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'native-menu',
  ])

  assert(
    await pathExists(path.join(target, 'src', 'lib', 'menu.ts')),
    'native-menu should copy menu.ts'
  )
  const nativeMenuAppTsx = await readFile(path.join(target, 'src', 'App.tsx'), 'utf8')
  assert(
    nativeMenuAppTsx.includes('buildAppMenu()'),
    'native-menu should inject buildAppMenu into App.tsx'
  )

  const projectMap = await readFile(path.join(target, 'PROJECT_MAP.md'), 'utf8')
  assert(projectMap.includes('Enabled features: preferences'), 'PROJECT_MAP.md should record applied feature')

  const state = JSON.parse(await readFile(path.join(target, '.tauri-creator.json'), 'utf8'))
  assert(state.enabledFeatures.includes('preferences'), 'state file should record applied feature')
  assert(
    state.enabledFeatures.join(',') === 'preferences,app-lifecycle,logging,sqlite,quick-pane,specta-bindings,dx-tools,ui-tailwind,app-state,custom-titlebar,native-menu',
    'state file should record dependency-ordered feature application'
  )
  // Test ui-shadcn
  runNode(applyFeatureScript, ['--target', target, '--feature', 'ui-shadcn'])
  assert(
    await pathExists(path.join(target, 'src', 'components', 'ui', 'button.tsx')),
    'ui-shadcn components should be copied'
  )

  // Test ui-layout
  runNode(applyFeatureScript, ['--target', target, '--feature', 'ui-layout'])
  assert(
    await pathExists(path.join(target, 'src', 'components', 'layout', 'MainWindow.tsx')),
    'ui-layout components should be copied'
  )

  // Test i18n
  runNode(applyFeatureScript, ['--target', target, '--feature', 'i18n'])
  assert(
    await pathExists(path.join(target, 'src', 'i18n', 'config.ts')),
    'i18n config should be copied'
  )
  const cargoTomlAfterI18n = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    cargoTomlAfterI18n.includes('tauri-plugin-os = "2"'),
    'i18n should merge a valid Tauri OS plugin Cargo dependency'
  )
  const capabilityAfterI18n = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    capabilityAfterI18n.permissions.includes('os:allow-locale'),
    'i18n should allow reading the system locale during startup'
  )
  const appSourceAfterI18n = await readFile(path.join(target, 'src', 'App.tsx'), 'utf8')
  assertImportCount(
    appSourceAfterI18n,
    "import { useEffect, useState } from 'react'",
    1,
    'native-menu and i18n should share a merged React hook import'
  )
  assertImportCount(
    appSourceAfterI18n,
    "import { useEffect } from 'react'",
    0,
    'i18n should not add a second standalone React hook import'
  )

  // Test ui-preferences
  runNode(applyFeatureScript, ['--target', target, '--feature', 'ui-preferences'])
  assert(
    await pathExists(path.join(target, 'src', 'components', 'preferences', 'PreferencesDialog.tsx')),
    'PreferencesDialog should be copied'
  )
  assert(
    await pathExists(path.join(target, 'src', 'components', 'preferences', 'panes', 'GeneralPane.tsx')),
    'GeneralPane should be copied'
  )
  assert(
    await pathExists(path.join(target, 'src', 'components', 'preferences', 'ShortcutPicker.tsx')),
    'ShortcutPicker should be copied'
  )
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

console.log('apply-feature smoke test passed')
