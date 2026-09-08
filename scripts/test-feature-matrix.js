import assert from 'node:assert/strict'
import { featureMatrix } from './verify-feature-matrix.js'
import { loadFeatureCatalog } from './lib/feature-catalog.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = await loadFeatureCatalog(root),
  matrix = await featureMatrix()
for (const name of catalog.keys())
  assert.equal(matrix.filter((entry) => entry.id === name).length, 1)
assert.ok(
  !matrix
    .find((entry) => entry.id === 'ui-layout')
    .closure.includes('quick-pane')
)
assert.ok(
  matrix
    .find((entry) => entry.id === 'custom-titlebar+i18n')
    .closure.includes('os-runtime')
)
assert.equal(new Set(matrix.map((entry) => entry.id)).size, matrix.length)
console.log(
  `Feature matrix covers ${catalog.size} standalone features and ${matrix.length - catalog.size} boundary combinations`
)
