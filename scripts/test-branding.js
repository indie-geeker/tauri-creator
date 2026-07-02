import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  'build',
])

const ignoredRelativeDirectories = new Set([
  path.join('docs', 'plans'),
])

const textExtensions = new Set([
  '',
  '.css',
  '.html',
  '.js',
  '.json',
  '.lock',
  '.md',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.yml',
])

function textFromCodes(codes) {
  return String.fromCharCode(...codes)
}

function isIgnoredRelativeDirectory(relativePath) {
  return ignoredRelativeDirectories.has(relativePath)
}

const bannedTerms = [
  [116, 97, 117, 114, 105, 45, 115, 111, 108, 111, 45, 107, 105, 116],
  [84, 97, 117, 114, 105, 32, 83, 111, 108, 111, 32, 75, 105, 116],
  [116, 97, 117, 114, 105, 32, 115, 111, 108, 111, 32, 107, 105, 116],
  [116, 97, 117, 114, 105, 95, 115, 111, 108, 111, 95, 107, 105, 116],
  [116, 97, 117, 114, 105, 83, 111, 108, 111, 75, 105, 116],
  [84, 65, 85, 82, 73, 95, 83, 79, 76, 79, 95, 75, 73, 84],
  [46, 116, 97, 117, 114, 105, 45, 115, 111, 108, 111, 45, 107, 105, 116],
  [84, 83, 75, 58],
  [84, 83, 75, 95],
  [116, 97, 117, 114, 105, 45, 116, 101, 109, 112, 108, 97, 116, 101],
  [84, 97, 117, 114, 105, 32, 84, 101, 109, 112, 108, 97, 116, 101],
  [47, 85, 115, 101, 114, 115, 47, 119, 101, 110, 47, 68, 101, 115, 107, 116, 111, 112, 47, 80, 101, 114, 115, 111, 110, 97, 108, 47, 76, 101, 97, 114, 110, 105, 110, 103],
  [114, 101, 102, 101, 114, 101, 110, 99, 101, 32, 112, 114, 111, 106, 101, 99, 116],
  [114, 101, 102, 101, 114, 101, 110, 99, 101, 45, 100, 101, 114, 105, 118, 101, 100],
  [114, 101, 102, 101, 114, 101, 110, 99, 101, 45, 115, 116, 121, 108, 101],
  [114, 101, 102, 101, 114, 101, 110, 99, 101, 32, 116, 101, 109, 112, 108, 97, 116, 101],
  [115, 116, 97, 116, 101, 45, 111, 110, 105, 111, 110],
  [115, 116, 97, 116, 101, 32, 111, 110, 105, 111, 110],
  [115, 116, 97, 116, 117, 115, 32, 111, 110, 105, 111, 110],
  [231, 138, 182, 230, 128, 129, 230, 180, 139, 232, 145, 177],
].map(textFromCodes)

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name)
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue
      }
      if (isIgnoredRelativeDirectory(relativePath)) {
        continue
      }
      files.push(...await collectFiles(path.join(directory, entry.name), relativePath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const filePath = path.join(directory, entry.name)
    if (textExtensions.has(path.extname(filePath))) {
      files.push(filePath)
    }
  }

  return files
}

const files = await collectFiles(repoRoot)
const failures = []

for (const filePath of files) {
  const relativePath = path.relative(repoRoot, filePath)
  for (const term of bannedTerms) {
    if (relativePath.includes(term)) {
      failures.push(`${relativePath}: file path contains legacy branding`)
      break
    }
  }

  const source = await readFile(filePath, 'utf8')
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const term of bannedTerms) {
      if (line.includes(term)) {
        failures.push(`${relativePath}:${index + 1}: contains legacy branding`)
        break
      }
    }
  })
}

if (failures.length > 0) {
  console.error('Legacy branding traces found:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Branding check passed for ${files.length} files.`)
