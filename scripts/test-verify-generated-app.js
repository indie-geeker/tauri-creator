import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const verifyGeneratedAppScript = path.join(root, 'scripts', 'verify-generated-app.js')

const helpOutput = execFileSync(process.execPath, [
  verifyGeneratedAppScript,
  '--help',
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
})

if (!helpOutput.includes('--strict')) {
  throw new Error('verify-generated-app should document strict generated-app check mode')
}

if (!helpOutput.includes('--tauri-build')) {
  throw new Error('verify-generated-app should document Tauri bundle verification mode')
}

const output = execFileSync(process.execPath, [
  verifyGeneratedAppScript,
  '--quick',
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
})

const expectedDefaultRecipes = [
  'desktop',
  'essential',
  'minimal',
  'production',
]

for (const recipeName of expectedDefaultRecipes) {
  if (!output.includes(`Verified generated app recipe ${recipeName}`)) {
    throw new Error(`verify-generated-app should verify default recipe ${recipeName}`)
  }
}

for (const oldRecipeName of [
  'desktop-tool',
  'productivity',
  'quick-capture',
  'local-data-app',
  'tray-utility',
]) {
  if (output.includes(`Verified generated app recipe ${oldRecipeName}`)) {
    throw new Error(`verify-generated-app should not verify old scenario recipe ${oldRecipeName}`)
  }
}

for (const sidebar of ['left', 'right', 'both']) {
  const sidebarOutput = execFileSync(process.execPath, [
    verifyGeneratedAppScript,
    '--quick',
    '--recipe',
    'desktop',
    '--sidebar',
    sidebar,
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (!sidebarOutput.includes(`Verified generated app recipe desktop with sidebar ${sidebar} using npm`)) {
    throw new Error(`verify-generated-app should pass --sidebar ${sidebar} into desktop quick verification`)
  }
}

const packageManagerOutput = execFileSync(process.execPath, [
  verifyGeneratedAppScript,
  '--quick',
  '--recipe',
  'minimal',
  '--package-manager',
  'pnpm',
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
})

if (!packageManagerOutput.includes('Verified generated app recipe minimal using pnpm')) {
  throw new Error('verify-generated-app should pass the selected package manager into generated apps')
}

const postCreateUpdaterOutput = execFileSync(process.execPath, [
  verifyGeneratedAppScript,
  '--quick',
  '--recipe',
  'minimal',
  '--feature',
  'updater',
  '--package-manager',
  'npm',
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
})

if (!postCreateUpdaterOutput.includes('Verified generated app recipe minimal with feature updater using npm')) {
  throw new Error('verify-generated-app should verify post-create updater application')
}

let missingSigningKeyFailed = false
try {
  execFileSync(process.execPath, [
    verifyGeneratedAppScript,
    '--recipe',
    'production',
    '--package-manager',
    'npm',
    '--tauri-build',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: '',
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
    },
    stdio: 'pipe',
  })
} catch (error) {
  missingSigningKeyFailed = true
  const outputText = `${error.stdout?.toString('utf8') ?? ''}\n${error.stderr?.toString('utf8') ?? ''}`
  if (!outputText.includes('TAURI_SIGNING_PRIVATE_KEY')) {
    throw new Error('verify-generated-app --tauri-build should fail early with signing key guidance for updater recipes')
  }
}

if (!missingSigningKeyFailed) {
  throw new Error('verify-generated-app --tauri-build should fail when updater signing key is missing')
}

console.log('verify-generated-app quick test passed')
