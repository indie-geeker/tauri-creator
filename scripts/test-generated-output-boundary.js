import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

const persistentGeneratedDirs = ['test-run', 'generated']
for (const dir of persistentGeneratedDirs) {
  assert(
    !(await pathExists(path.join(root, dir))),
    `${dir}/ should not exist at the project root; generated apps belong in system temp or tmp/`
  )
}

const scriptsDir = path.join(root, 'scripts')
const scriptEntries = await readdir(scriptsDir, { withFileTypes: true })
const testScripts = scriptEntries
  .filter((entry) => entry.isFile() && /^test-.*\.js$/.test(entry.name))
  .filter((entry) => entry.name !== 'test-generated-output-boundary.js')
  .map((entry) => entry.name)

for (const scriptName of testScripts) {
  const scriptPath = path.join(scriptsDir, scriptName)
  const source = await readFile(scriptPath, 'utf8')
  assert(
    !source.includes("'test-run'") && !source.includes('"test-run"'),
    `${scriptName} should not write generated apps to test-run/`
  )
}

console.log('generated output boundary test passed')
