import assert from 'node:assert/strict'
import { createGeneratedFixture } from './lib/generated-fixture.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
for (const recipe of ['minimal', 'starter', 'full']) {
  const f = await createGeneratedFixture({ recipe })
  try {
    const bootstrap = await readFile(
      path.join(f.target, 'src/generated/bootstrap.ts'),
      'utf8'
    )
    assert.ok(
      bootstrap.includes('reverse()'),
      'runtime must dispose in reverse dependency order'
    )
    const app = await readFile(path.join(f.target, 'src/App.tsx'), 'utf8')
    assert.ok(app.length < 600, 'App should delegate assembly')
    const commands = await readFile(
      path.join(f.target, 'src-tauri/src/generated/commands.rs'),
      'utf8'
    )
    assert.ok(commands.includes('greet'))
    if (recipe === 'minimal') assert.ok(!bootstrap.includes('quick-pane'))
  } finally {
    await f.close()
  }
}
console.log('Generated registration contracts passed')
