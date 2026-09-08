import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { createGeneratedFixture } from './lib/generated-fixture.js'
for (const features of [
  [],
  ['ui-preferences'],
  ['quick-pane'],
  ['ui-preferences', 'quick-pane'],
  ['ui-layout'],
]) {
  const f = await createGeneratedFixture({ features })
  try {
    const state = JSON.parse(
      await readFile(path.join(f.target, '.tauri-creator.json'), 'utf8')
    )
    if (!features.includes('quick-pane'))
      assert.ok(
        !state.enabledFeatures.includes('quick-pane'),
        'generic settings/layout must not enable quick-pane'
      )
    const pane = path.join(
      f.target,
      'src/features/quick-pane/QuickPanePreferencesPane.tsx'
    )
    if (features.includes('quick-pane') && features.includes('ui-preferences'))
      await access(pane)
    else await assert.rejects(access(pane))
  } finally {
    await f.close()
  }
}
console.log('Settings contribution dependency matrix passed')
