import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { commandExportsForState } from '../specta-bindings.js'
export async function renderRegistrations(target, state, catalog) {
  const enabled = new Set(state.enabledFeatures ?? [])
  const imports = [],
    starts = []
  for (const name of enabled) {
    const runtime = catalog.get(name).manifest.frontendRuntime
    if (!runtime) continue
    if (
      !/^[a-zA-Z0-9_/-]+$/.test(runtime.module) ||
      runtime.module.split('/').includes('..') ||
      !/^[a-zA-Z][a-zA-Z0-9]*$/.test(runtime.exportName)
    )
      throw new Error(`Invalid frontend runtime: ${name}`)
    const alias = `start${starts.length}`
    imports.push(
      `import { ${runtime.exportName} as ${alias} } from '../${runtime.module}'`
    )
    starts.push(alias)
  }
  const bootstrap = `import { createRuntime } from '../lib/runtime'
${imports.join('\n')}

const runtime = createRuntime([
  // Dependency order; runtime disposes in reverse().
${starts.map((name) => `  ${name},`).join('\n')}
])
export const start = runtime.start
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())
`
  await mkdir(path.join(target, 'src/generated'), { recursive: true })
  await writeFile(path.join(target, 'src/generated/bootstrap.ts'), bootstrap)
  if (enabled.has('app-state')) {
    const file = path.join(target, 'src/generated/providers.tsx')
    let source = await readFile(file, 'utf8')
    source =
      "import { PreferencesRuntime } from '../services/preferences'\n" +
      source.replace('{children}', '<PreferencesRuntime />\n    {children}')
    await writeFile(file, source)
  }
  if (enabled.has('preferences') && enabled.has('ui-shadcn')) {
    await mkdir(path.join(target, 'src/providers'), { recursive: true })
    await copyFile(
      path.join(
        catalog.get(enabled.has('app-state') ? 'app-state' : 'preferences').dir,
        'contributions/ui-shadcn/files/src/providers/PreferencesThemeProvider.tsx'
      ),
      path.join(target, 'src/providers/PreferencesThemeProvider.tsx')
    )
    const file = path.join(target, 'src/generated/application.tsx')
    const source = (await readFile(file, 'utf8')).replace(
      "import { ThemeProvider } from '../components/ThemeProvider'",
      "import { PreferencesThemeProvider as ThemeProvider } from '../providers/PreferencesThemeProvider'"
    )
    await writeFile(file, source)
  }
  const exports = commandExportsForState(state, catalog)
  const commands = [
    'crate::greet',
    ...exports.flatMap((group) =>
      group.commands.map((command) => `crate::${group.module}::${command}`)
    ),
  ]
  await mkdir(path.join(target, 'src-tauri/src/generated'), { recursive: true })
  await writeFile(
    path.join(target, 'src-tauri/src/generated/commands.rs'),
    `pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {\n${`    tauri::generate_handler![${commands.join(', ')},]`.length <= 100 ? `    tauri::generate_handler![${commands.join(', ')},]` : `    tauri::generate_handler![\n${commands.map((command) => `        ${command},`).join('\n')}\n    ]`}\n}\n`
  )
  await writeFile(
    path.join(target, 'src-tauri/src/generated/command_names.rs'),
    `pub const COMMAND_NAMES: &[&str] = &[\n${commands.map((command) => `    ${JSON.stringify(command.split('::').at(-1))},`).join('\n')}\n];\n`
  )
  const libPath = path.join(target, 'src-tauri/src/lib.rs')
  let lib = await readFile(libPath, 'utf8')
  const start = lib.indexOf('pub fn run()')
  let run = lib
    .slice(start)
    .replace(/\s*let builder = bindings::generate_bindings\(\);\n/, '')
    .replace(
      '.invoke_handler(builder.invoke_handler())',
      '.invoke_handler(commands::invoke_handler())'
    )
    .replace(
      /\.invoke_handler\(tauri::generate_handler!\[[\s\S]*?\]\)/,
      '.invoke_handler(commands::invoke_handler())'
    )
  if (!enabled.has('app-lifecycle'))
    run = run
      .replace(
        '.run(|app_handle, event| match &event {',
        '.run(|app_handle, event| {'
      )
      .replace(
        '            tauri::RunEvent::Exit => {',
        '            if let tauri::RunEvent::Exit = event {'
      )
      .replace('            _ => {}\n', '')
  const rustImports = ['pub mod commands;']
  if (run.includes('features::')) rustImports.push('use crate::features;')
  if (run.includes('infrastructure::'))
    rustImports.push('use crate::infrastructure;')
  if (enabled.has('app-lifecycle')) rustImports.push('use tauri::Manager;')
  await writeFile(
    path.join(target, 'src-tauri/src/generated/mod.rs'),
    rustImports.join('\n') + '\n\n' + run
  )
  lib =
    lib.slice(0, start).replace('use tauri::Manager;\n', '') +
    'mod generated;\n\npub fn run() {\n    generated::run()\n}\n'
  await writeFile(libPath, lib)
}
