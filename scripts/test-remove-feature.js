import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const createAppScript = path.join(root, 'scripts', 'create-app.js')
const applyFeatureScript = path.join(root, 'scripts', 'apply-feature.js')
const removeFeatureScript = path.join(root, 'scripts', 'remove-feature.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
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

function runNode(script, args) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-remove-feature-'))
const target = path.join(tempRoot, 'demo')
const desktopTarget = path.join(tempRoot, 'desktop-demo')
const spectaTarget = path.join(tempRoot, 'specta-demo')

try {
  runNode(createAppScript, [
    '--name',
    'demo',
    '--target',
    target,
    '--recipe',
    'minimal',
  ])

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'preferences',
  ])

  const dryRunOutput = runNode(removeFeatureScript, [
    '--target',
    target,
    '--feature',
    'preferences',
    '--dry-run',
  ])
  assert(
    dryRunOutput.includes('Dry run: would remove feature: preferences'),
    'remove-feature dry-run should report the planned feature removal'
  )
  assert(
    await pathExists(path.join(target, 'src', 'features', 'preferences', 'index.ts')),
    'remove-feature dry-run should not delete declared feature files'
  )
  const dryRunState = JSON.parse(await readFile(path.join(target, '.tauri-creator.json'), 'utf8'))
  assert(
    dryRunState.enabledFeatures.includes('preferences'),
    'remove-feature dry-run should not update enabled feature state'
  )

  runNode(removeFeatureScript, [
    '--target',
    target,
    '--feature',
    'preferences',
  ])

  assert(
    !(await pathExists(path.join(target, 'src', 'features', 'preferences', 'index.ts'))),
    'remove-feature should delete declared feature files'
  )

  const appSource = await readFile(path.join(target, 'src', 'App.tsx'), 'utf8')
  assert(
    !appSource.includes('Preferences feature enabled.'),
    'remove-feature should delete marker insertions'
  )

  const rustLib = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    !rustLib.includes('pub mod preferences;'),
    'remove-feature should delete Rust module marker insertions'
  )
  assert(
    !rustLib.includes('features::preferences::load_preferences'),
    'remove-feature should delete Rust command marker insertions'
  )
  assert(
    !rustLib.includes('features::preferences::save_preferences'),
    'remove-feature should delete Rust save command marker insertions'
  )

  const defaultCapability = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    !defaultCapability.permissions.includes('preferences:default'),
    'remove-feature should not leave feature capability permissions'
  )

  const state = JSON.parse(await readFile(path.join(target, '.tauri-creator.json'), 'utf8'))
  assert(
    !state.enabledFeatures.includes('preferences'),
    'remove-feature should update enabled feature state'
  )

  const projectMap = await readFile(path.join(target, 'PROJECT_MAP.md'), 'utf8')
  assert(
    projectMap.includes('Enabled features: none'),
    'remove-feature should update PROJECT_MAP.md'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'sqlite',
  ])

  runNode(removeFeatureScript, [
    '--target',
    target,
    '--feature',
    'sqlite',
  ])

  const cargoToml = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    !cargoToml.includes('rusqlite ='),
    'remove-feature should delete feature cargo dependencies'
  )

  const rustLibAfterSqliteRemoval = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    !rustLibAfterSqliteRemoval.includes('pub mod database;'),
    'remove-feature should delete sqlite infrastructure module marker insertions'
  )
  assert(
    !rustLibAfterSqliteRemoval.includes('infrastructure::database::get_database_health'),
    'remove-feature should delete sqlite command marker insertions'
  )

  runNode(applyFeatureScript, [
    '--target',
    target,
    '--feature',
    'quick-pane',
  ])

  runNode(removeFeatureScript, [
    '--target',
    target,
    '--feature',
    'quick-pane',
  ])

  assert(
    !(await pathExists(path.join(target, 'src', 'features', 'quick-pane', 'index.tsx'))),
    'remove-feature should delete quick-pane frontend files'
  )
  assert(
    !(await pathExists(path.join(target, 'quick-pane.html'))),
    'remove-feature should delete the quick-pane HTML entry'
  )
  assert(
    !(await pathExists(path.join(target, 'src', 'quick-pane-main.tsx'))),
    'remove-feature should delete the quick-pane React entry'
  )

  const cargoTomlAfterQuickPaneRemoval = await readFile(path.join(target, 'src-tauri', 'Cargo.toml'), 'utf8')
  assert(
    !cargoTomlAfterQuickPaneRemoval.includes('tauri-plugin-global-shortcut ='),
    'remove-feature should delete quick-pane cargo dependencies'
  )
  assert(
    cargoTomlAfterQuickPaneRemoval.includes('tauri = { version = "2", features = [] }'),
    'remove-feature should restore the base Tauri dependency features'
  )
  assert(
    !cargoTomlAfterQuickPaneRemoval.includes('tauri-nspanel ='),
    'remove-feature should delete quick-pane macOS-only cargo dependencies'
  )

  const tauriConfigAfterQuickPaneRemoval = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'tauri.conf.json'), 'utf8')
  )
  assert(
    !('macOSPrivateApi' in tauriConfigAfterQuickPaneRemoval.app),
    'remove-feature should delete quick-pane macOS private API configuration'
  )

  const rustLibAfterQuickPaneRemoval = await readFile(path.join(target, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    !rustLibAfterQuickPaneRemoval.includes('tauri_plugin_global_shortcut::Builder'),
    'remove-feature should delete quick-pane plugin marker insertions'
  )
  assert(
    !rustLibAfterQuickPaneRemoval.includes('register_saved_or_default_quick_pane_shortcut'),
    'remove-feature should delete quick-pane setup marker insertions'
  )
  assert(
    !rustLibAfterQuickPaneRemoval.includes('tauri_nspanel::init()'),
    'remove-feature should delete quick-pane NSPanel plugin marker insertions'
  )
  assert(
    !rustLibAfterQuickPaneRemoval.includes('init_quick_pane_window'),
    'remove-feature should delete quick-pane window initialization marker insertions'
  )
  assert(
    !rustLibAfterQuickPaneRemoval.includes('pub mod quick_pane;'),
    'remove-feature should delete quick-pane module marker insertions'
  )
  assert(
    !rustLibAfterQuickPaneRemoval.includes('features::quick_pane::toggle_quick_pane'),
    'remove-feature should delete quick-pane command marker insertions'
  )

  const capabilityAfterQuickPaneRemoval = JSON.parse(
    await readFile(path.join(target, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  )
  assert(
    !capabilityAfterQuickPaneRemoval.windows.includes('quick-pane'),
    'remove-feature should delete the quick-pane window capability scope'
  )
  assert(
    !capabilityAfterQuickPaneRemoval.permissions.includes('core:event:default'),
    'remove-feature should delete quick-pane event permissions'
  )

  const viteConfigAfterQuickPaneRemoval = await readFile(path.join(target, 'vite.config.ts'), 'utf8')
  assert(
    !viteConfigAfterQuickPaneRemoval.includes('quick-pane.html'),
    'remove-feature should delete the quick-pane Vite entry marker insertion'
  )

  runNode(createAppScript, [
    '--name',
    'specta-demo',
    '--target',
    spectaTarget,
    '--recipe',
    'minimal',
  ])

  runNode(applyFeatureScript, [
    '--target',
    spectaTarget,
    '--feature',
    'preferences',
  ])
  runNode(applyFeatureScript, [
    '--target',
    spectaTarget,
    '--feature',
    'sqlite',
  ])
  runNode(applyFeatureScript, [
    '--target',
    spectaTarget,
    '--feature',
    'specta-bindings',
  ])

  const spectaBindingsBeforeSqliteRemoval = await readFile(
    path.join(spectaTarget, 'src-tauri', 'src', 'bindings.rs'),
    'utf8'
  )
  assert(
    spectaBindingsBeforeSqliteRemoval.includes('database::get_database_health,'),
    'specta-bindings should include sqlite commands before sqlite is removed'
  )

  runNode(removeFeatureScript, [
    '--target',
    spectaTarget,
    '--feature',
    'sqlite',
  ])

  const spectaBindingsAfterSqliteRemoval = await readFile(
    path.join(spectaTarget, 'src-tauri', 'src', 'bindings.rs'),
    'utf8'
  )
  assert(
    !spectaBindingsAfterSqliteRemoval.includes('database::get_database_health'),
    'remove-feature should regenerate Specta bindings after removing a command feature'
  )
  assert(
    spectaBindingsAfterSqliteRemoval.includes('preferences::load_preferences,'),
    'remove-feature should keep remaining command features in Specta bindings'
  )

  runNode(removeFeatureScript, [
    '--target',
    spectaTarget,
    '--feature',
    'specta-bindings',
  ])

  assert(
    !(await pathExists(path.join(spectaTarget, 'src-tauri', 'src', 'bindings.rs'))),
    'remove-feature should delete bindings.rs when specta-bindings is removed'
  )
  const spectaLibAfterRemoval = await readFile(path.join(spectaTarget, 'src-tauri', 'src', 'lib.rs'), 'utf8')
  assert(
    !spectaLibAfterRemoval.includes('builder.invoke_handler()'),
    'remove-feature should restore the plain Tauri invoke handler after removing specta-bindings'
  )
  assert(
    spectaLibAfterRemoval.includes('tauri::generate_handler!['),
    'remove-feature should restore generate_handler after removing specta-bindings'
  )
  const preferencesRustAfterSpectaRemoval = await readFile(
    path.join(spectaTarget, 'src-tauri', 'src', 'features', 'preferences.rs'),
    'utf8'
  )
  assert(
    !preferencesRustAfterSpectaRemoval.includes('#[specta::specta]'),
    'remove-feature should remove Specta command attributes after removing specta-bindings'
  )

  runNode(createAppScript, [
    '--name',
    'desktop-demo',
    '--target',
    desktopTarget,
    '--recipe',
    'desktop',
  ])

  runNode(removeFeatureScript, [
    '--target',
    desktopTarget,
    '--feature',
    'ui-layout',
  ])

  assert(
    !(await pathExists(path.join(desktopTarget, 'src', 'components', 'layout'))),
    'remove-feature should delete ui-layout component files'
  )
  const appContentAfterLayoutRemoval = await readFile(path.join(desktopTarget, 'src', 'AppContent.tsx'), 'utf8')
  assert(
    !appContentAfterLayoutRemoval.includes("from './components/layout/MainWindow'"),
    'remove-feature should not leave AppContent importing the removed layout shell'
  )
  assert(
    appContentAfterLayoutRemoval.includes('Run sample command'),
    'remove-feature should restore base AppContent after removing ui-layout'
  )

  runNode(removeFeatureScript, [
    '--target',
    desktopTarget,
    '--feature',
    'diagnostics',
  ])

  const desktopProjectMap = await readFile(path.join(desktopTarget, 'PROJECT_MAP.md'), 'utf8')
  assert(
    desktopProjectMap.includes('Enabled features: specta-bindings, preferences, logging') &&
      desktopProjectMap.includes('command-palette') &&
      desktopProjectMap.includes('project-governance'),
    'PROJECT_MAP.md should keep remaining enabled features'
  )
  assert(
    !desktopProjectMap.includes('`diagnostics`:'),
    'PROJECT_MAP.md feature details should omit removed features'
  )
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

console.log('remove-feature smoke test passed')
