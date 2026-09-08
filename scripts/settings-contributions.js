import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const fields = ['id', 'requires', 'source', 'exportName', 'labelKey', 'order']
export function validateSettingsContribution(value, catalog) {
  if (
    !value ||
    fields.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error('Invalid settingsContributions fields')
  if (
    !/^[a-z][a-z0-9-]*$/.test(value.id) ||
    !/^[A-Z][A-Za-z0-9]*$/.test(value.exportName) ||
    !Number.isFinite(value.order) ||
    !/^[A-Za-z0-9_.-]+$/.test(value.labelKey)
  )
    throw new Error('Invalid settings contribution identity')
  if (
    !Array.isArray(value.requires) ||
    !value.requires.includes('ui-preferences') ||
    value.requires.some((name) => !catalog.has(name))
  )
    throw new Error('Invalid settings contribution requires')
  if (
    !/^contributions\/ui-preferences\/files\/src\/[A-Za-z0-9_./-]+\.tsx$/.test(
      value.source
    ) ||
    value.source.split('/').includes('..')
  )
    throw new Error('Invalid settings contribution source')
}
export async function syncSettingsContributions(target, state, catalog) {
  const enabled = new Set(state.enabledFeatures ?? [])
  if (!enabled.has('ui-preferences')) return
  const imports = [
    "import { AppearancePane } from '../components/preferences/panes/AppearancePane'",
    "import type { PreferencesPaneRegistration } from '../components/preferences/PreferencesDialog'",
  ]
  const panes = [
    "  {\n    id: 'appearance',\n    labelKey: 'preferences.appearance',\n    component: AppearancePane,\n    order: 0,\n  },",
  ]
  const ids = new Set(['appearance'])
  for (const name of [...enabled].sort()) {
    const entry = catalog.get(name)
    for (const item of entry.manifest.settingsContributions ?? []) {
      validateSettingsContribution(item, catalog)
      if (!item.requires.every((dep) => enabled.has(dep))) continue
      if (ids.has(item.id))
        throw new Error(`Duplicate settings pane: ${item.id}`)
      ids.add(item.id)
      const output = item.source.split('/files/')[1]
      const destination = path.join(target, output)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(
        destination,
        await readFile(path.join(entry.dir, item.source))
      )
      const alias = `Pane${ids.size}`
      imports.push(
        `import { ${item.exportName} as ${alias} } from '../${output.slice(4, -4)}'`
      )
      panes.push(
        `  {\n    id: '${item.id}',\n    labelKey: '${item.labelKey}',\n    component: ${alias},\n    order: ${item.order},\n  },`
      )
    }
  }
  await mkdir(path.join(target, 'src/generated'), { recursive: true })
  await writeFile(
    path.join(target, 'src/generated/settings.ts'),
    imports.join('\n') +
      '\n\nexport const settingsPanes: PreferencesPaneRegistration[] = [\n' +
      panes.join('\n') +
      '\n]\n'
  )
}
