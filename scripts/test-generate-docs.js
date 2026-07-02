import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generateDocsScript = path.join(root, 'scripts', 'generate-docs.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

execFileSync(process.execPath, [generateDocsScript, '--check'], {
  cwd: root,
  stdio: 'pipe',
})

const featureIndex = await readFile(path.join(root, 'docs', 'features', 'index.md'), 'utf8')
const recipeIndex = await readFile(path.join(root, 'docs', 'recipes', 'index.md'), 'utf8')
const readme = await readFile(path.join(root, 'README.md'), 'utf8')

assert(featureIndex.includes('| `quick-pane` |'), 'feature index should include quick-pane')
assert(featureIndex.includes('| `preferences` |'), 'feature index should include preferences')
assert(recipeIndex.includes('| `minimal` |'), 'recipe index should include minimal')
assert(recipeIndex.includes('| `essential` |'), 'recipe index should include essential')
assert(recipeIndex.includes('| `desktop` |'), 'recipe index should include desktop')
assert(recipeIndex.includes('| `production` |'), 'recipe index should include production')

const readmeRecipeStart = '<!-- TAURI_CREATOR:README_RECIPES_START -->'
const readmeRecipeEnd = '<!-- TAURI_CREATOR:README_RECIPES_END -->'
const readmeRecipeStartIndex = readme.indexOf(readmeRecipeStart)
const readmeRecipeEndIndex = readme.indexOf(readmeRecipeEnd)

assert(readmeRecipeStartIndex !== -1, 'README should contain generated recipe list start marker')
assert(readmeRecipeEndIndex !== -1, 'README should contain generated recipe list end marker')
assert(
  readmeRecipeEndIndex > readmeRecipeStartIndex,
  'README generated recipe list markers should be ordered'
)

const readmeRecipeBlock = readme.slice(readmeRecipeStartIndex, readmeRecipeEndIndex)
const indexedRecipeNames = [...recipeIndex.matchAll(/^\| `([^`]+)` \|/gm)]
  .map((match) => match[1])
const expectedRecipeNames = ['minimal', 'essential', 'desktop', 'production']

assert(
  indexedRecipeNames.join(',') === expectedRecipeNames.join(','),
  'recipe index should contain only minimal, essential, and desktop in ladder order'
)

for (const recipeName of indexedRecipeNames) {
  assert(
    readmeRecipeBlock.includes(`\`${recipeName}\``),
    `README generated recipe list should include ${recipeName}`
  )
}

for (const oldRecipeName of [
  'desktop-tool',
  'productivity',
  'quick-capture',
  'local-data-app',
  'tray-utility',
]) {
  assert(
    !recipeIndex.includes(`\`${oldRecipeName}\``),
    `recipe index should not include old scenario recipe ${oldRecipeName}`
  )
  assert(
    !readmeRecipeBlock.includes(`\`${oldRecipeName}\``),
    `README generated recipe list should not include old scenario recipe ${oldRecipeName}`
  )
}

console.log('generate-docs check passed')
