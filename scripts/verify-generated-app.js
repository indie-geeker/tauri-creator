import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultPackageManager, normalizePackageManager } from './package-managers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const recipesDir = path.join(root, 'recipes')
const createAppScript = path.join(root, 'scripts', 'create-app.js')
const applyFeatureScript = path.join(root, 'scripts', 'apply-feature.js')

function printUsage() {
  console.log(`Usage: node scripts/verify-generated-app.js [--quick] [--strict] [--tauri-build] [--recipe <name>] [--feature <name>] [--sidebar <left|right|both>] [--package-manager <npm|pnpm>]

Options:
  --quick              Generate apps and run lightweight structural checks only.
  --strict             Run the generated app's own check:all before build.
  --tauri-build        Run the generated app's Tauri bundle build after checks.
  --recipe             Verify one recipe. Defaults to every recipe in recipes/*.json.
  --feature            Apply one extra feature after recipe generation.
  --sidebar            Pass a desktop sidebar layout to create-app for recipes with ui-layout.
  --package-manager    Package manager used in generated apps. Defaults to npm.
`)
}

function fail(message) {
  console.error(`verify-generated-app: ${message}`)
  process.exit(1)
}

function textFromCodes(codes) {
  return String.fromCharCode(...codes)
}

function parseArgs(argv) {
  const args = {
    quick: false,
    strict: false,
    tauriBuild: false,
    packageManager: defaultPackageManager,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }

    if (arg === '--quick') {
      args.quick = true
      continue
    }

    if (arg === '--strict') {
      args.strict = true
      continue
    }

    if (arg === '--tauri-build') {
      args.tauriBuild = true
      continue
    }

    if (!arg.startsWith('--')) {
      fail(`unexpected positional argument '${arg}'`)
    }

    const key = arg.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      fail(`missing value for --${key}`)
    }

    if (key === 'package-manager') {
      try {
        args.packageManager = normalizePackageManager(value)
      } catch (error) {
        fail(error.message)
      }
    } else if (key === 'sidebar') {
      const sidebar = value.trim().toLowerCase()
      if (!['left', 'right', 'both'].includes(sidebar)) {
        fail('--sidebar must be one of: left, right, both')
      }
      args.sidebar = sidebar
    } else {
      args[key] = value
    }
    index += 1
  }

  return args
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

function run(command, args, options = {}) {
  try {
    execFileSync(command, args, {
      cwd: options.cwd ?? root,
      stdio: options.stdio ?? 'pipe',
    })
  } catch (error) {
    const renderedCommand = [command, ...args].join(' ')
    const stdout = error.stdout?.toString('utf8') ?? ''
    const stderr = error.stderr?.toString('utf8') ?? ''
    throw new Error([
      `Command failed: ${renderedCommand}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join('\n'))
  }
}

async function readTextFileIfPossible(filePath) {
  const buffer = await readFile(filePath)
  if (buffer.includes(0)) return null
  return buffer.toString('utf8')
}

async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  const skippedDirectories = new Set(['node_modules', 'dist', 'target', '.git'])

  for (const entry of entries) {
    if (skippedDirectories.has(entry.name)) continue

    const relativePath = path.join(prefix, entry.name)
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }

  return files.sort()
}

async function assertNoUnresolvedPlaceholders(targetDir) {
  const files = await listFiles(targetDir)
  const placeholderPatterns = [
    /{{[A-Z][A-Z0-9_]*}}/,
    'YOUR_USERNAME',
    'YOUR_',
    textFromCodes([116, 97, 117, 114, 105, 45, 116, 101, 109, 112, 108, 97, 116, 101]),
  ]

  for (const file of files) {
    const text = await readTextFileIfPossible(path.join(targetDir, file))
    if (text === null) continue

    for (const pattern of placeholderPatterns) {
      const hasUnresolvedPlaceholder =
        typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
      if (hasUnresolvedPlaceholder) {
        fail(`${file} contains unresolved placeholder '${pattern}'`)
      }
    }
  }
}

async function assertGeneratedAppShape(targetDir) {
  const requiredFiles = [
    'package.json',
    'PROJECT_MAP.md',
    '.tauri-creator.json',
    'src/App.tsx',
    'src-tauri/tauri.conf.json',
    'src-tauri/src/lib.rs',
  ]

  for (const file of requiredFiles) {
    if (!(await pathExists(path.join(targetDir, file)))) {
      fail(`generated app is missing ${file}`)
    }
  }

  await assertNoUnresolvedPlaceholders(targetDir)
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function assertTauriBuildPrerequisites(targetDir) {
  const state = await readJson(path.join(targetDir, '.tauri-creator.json'))
  const enabledFeatures = new Set(state.enabledFeatures ?? [])

  if (enabledFeatures.has('updater') && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
    fail(
      '--tauri-build requires TAURI_SIGNING_PRIVATE_KEY when the generated app enables updater. ' +
        'Set TAURI_SIGNING_PRIVATE_KEY or verify a recipe without updater.'
    )
  }
}

function runGeneratedAppChecks(targetDir, packageManager, { strict = false, tauriBuild = false } = {}) {
  const commands = [[packageManager, ['install']]]

  if (strict) {
    commands.push([packageManager, ['run', 'check:all']])
  } else if (!tauriBuild) {
    commands.push(
      [packageManager, ['run', 'typecheck']],
      [packageManager, ['run', 'test:run']],
      [packageManager, ['run', 'rust:fmt:check']],
      [packageManager, ['run', 'rust:test']]
    )
  }

  commands.push([packageManager, ['run', tauriBuild ? 'tauri:build' : 'build']])

  for (const [command, args] of commands) {
    console.log(`Running ${[command, ...args].join(' ')} in ${targetDir}`)
    run(command, args, { cwd: targetDir })
  }
}

async function validateRecipeExists(recipeName) {
  const recipePath = path.join(recipesDir, `${recipeName}.json`)
  if (!(await pathExists(recipePath))) {
    fail(`unknown recipe '${recipeName}'`)
  }
}

async function listRecipeNames() {
  const entries = await readdir(recipesDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.basename(entry.name, '.json'))
    .sort()
}

function renderAppName(recipeName, featureName, sidebar) {
  return ['verify', recipeName, featureName, sidebar].filter(Boolean).join('-')
}

async function verifyOneRecipe({ recipeName, featureName, sidebar, quick, strict, tauriBuild, packageManager, tempRoot }) {
  await validateRecipeExists(recipeName)

  const appName = renderAppName(recipeName, featureName, sidebar)
  const targetDir = path.join(tempRoot, appName)
  const createAppArgs = [
    createAppScript,
    '--name',
    appName,
    '--target',
    targetDir,
    '--recipe',
    recipeName,
    '--package-manager',
    packageManager,
  ]

  if (sidebar) {
    createAppArgs.push('--sidebar', sidebar)
  }

  run(process.execPath, createAppArgs)

  if (featureName) {
    run(process.execPath, [
      applyFeatureScript,
      '--target',
      targetDir,
      '--feature',
      featureName,
    ])
  }

  await assertGeneratedAppShape(targetDir)

  if (tauriBuild) {
    await assertTauriBuildPrerequisites(targetDir)
  }

  if (!quick) {
    runGeneratedAppChecks(targetDir, packageManager, { strict, tauriBuild })
  }

  const featureSuffix = featureName ? ` with feature ${featureName}` : ''
  const sidebarSuffix = sidebar ? ` with sidebar ${sidebar}` : ''
  console.log(`Verified generated app recipe ${recipeName}${featureSuffix}${sidebarSuffix} using ${packageManager}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  if (args.sidebar && !args.recipe) {
    fail('--sidebar requires --recipe so it is not passed to recipes without ui-layout')
  }

  if (args.quick && args.tauriBuild) {
    fail('--tauri-build cannot be combined with --quick')
  }

  const recipes = args.recipe ? [args.recipe] : await listRecipeNames()
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tauri-creator-verify-'))

  try {
    for (const recipeName of recipes) {
      await verifyOneRecipe({
        recipeName,
        featureName: args.feature,
        sidebar: args.sidebar,
        quick: args.quick,
        strict: args.strict,
        tauriBuild: args.tauriBuild,
        packageManager: args.packageManager,
        tempRoot,
      })
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

await main()
