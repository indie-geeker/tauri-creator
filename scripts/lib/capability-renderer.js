import { readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { commandExportsForState } from '../specta-bindings.js'
export async function renderCapabilities(target, state, catalog) {
  const enabled = new Set(state.enabledFeatures ?? [])
  const commands = [
    'greet',
    ...commandExportsForState(state, catalog).flatMap(
      (group) => group.commands
    ),
  ]
  const permission = (command) => `allow-${command.replaceAll('_', '-')}`
  const native = ['core:default']
  for (const name of enabled)
    if (name !== 'custom-titlebar')
      native.push(...catalog.get(name).manifest.capabilities)
  const main = {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'main',
    description: 'Main window application commands and selected plugins.',
    windows: ['main'],
    permissions: [...new Set([...native, ...commands.map(permission)])],
  }
  const capabilities = ['main']
  async function write(name, value) {
    await writeFile(
      path.join(target, `src-tauri/capabilities/${name}.json`),
      JSON.stringify(value, null, 2) + '\n'
    )
  }
  await write('main', main)
  if (enabled.has('quick-pane')) {
    capabilities.push('quick-pane')
    await write('quick-pane', {
      $schema: '../gen/schemas/desktop-schema.json',
      identifier: 'quick-pane',
      description: 'Quick entry window: submit and dismiss only.',
      windows: ['quick-pane'],
      permissions: [
        'core:event:allow-listen',
        'core:event:allow-unlisten',
        'allow-submit-quick-pane',
        'allow-dismiss-quick-pane',
      ],
    })
  }
  if (enabled.has('custom-titlebar')) {
    capabilities.push('titlebar')
    await write('titlebar', {
      $schema: '../gen/schemas/desktop-schema.json',
      identifier: 'titlebar',
      description:
        'Native titlebar controls on supported custom-decoration platforms.',
      windows: ['main'],
      platforms: ['macOS', 'windows'],
      permissions: catalog.get('custom-titlebar').manifest.capabilities,
    })
  }
  await unlink(path.join(target, 'src-tauri/capabilities/default.json'))
  const configPath = path.join(target, 'src-tauri/tauri.conf.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  config.app.security.capabilities = capabilities
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
  await writeFile(
    path.join(target, 'src-tauri/build.rs'),
    `include!("src/generated/command_names.rs");\n\nfn main() {\n    println!("cargo:rerun-if-changed=src/generated/command_names.rs");\n    tauri_build::try_build(\n        tauri_build::Attributes::new()\n            .app_manifest(tauri_build::AppManifest::new().commands(COMMAND_NAMES)),\n    )\n    .expect("failed to build application permissions");\n}\n`
  )
}
