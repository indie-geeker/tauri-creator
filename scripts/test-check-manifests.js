import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkManifestsScript = path.join(root, 'scripts', 'check-manifests.js')
const invalidFeatureDir = path.join(root, 'features', 'zz-invalid-docs')
const invalidMarkerFeatureDir = path.join(root, 'features', 'zz-invalid-marker')
const invalidWizardFeatureDir = path.join(root, 'features', 'zz-invalid-wizard')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function runCheckManifests() {
  let failed = false
  let stderr = ''
  try {
    execFileSync(process.execPath, [checkManifestsScript], {
      cwd: root,
      stdio: 'pipe',
    })
  } catch (error) {
    failed = true
    stderr = error.stderr?.toString('utf8') ?? ''
  }

  return { failed, stderr }
}

function createManifest(name, overrides = {}) {
  return {
    name,
    description: `Test fixture for ${name}.`,
    stage: 'v1',
    dependsOn: [],
    conflictsWith: [],
    npmDependencies: [],
    cargoDependencies: [],
    files: [],
    tauriCommands: [],
    spectaExports: [],
    capabilities: [],
    qualityChecks: [],
    removeHints: [],
    wizard: { visible: false },
    ...overrides,
  }
}

async function assertInvalidWizard(manifest, expectedMessage) {
  await mkdir(invalidWizardFeatureDir, { recursive: true })
  await writeFile(
    path.join(invalidWizardFeatureDir, 'feature.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )

  const { failed, stderr } = runCheckManifests()
  assert(failed, `check-manifests should fail: ${expectedMessage}`)
  assert(
    stderr.includes(expectedMessage),
    `check-manifests should report '${expectedMessage}', received:\n${stderr}`
  )
}

try {
  const { wizard: _wizard, ...withoutWizard } = createManifest('zz-invalid-wizard')
  await assertInvalidWizard(withoutWizard, "missing required field 'wizard'")

  await assertInvalidWizard(
    createManifest('zz-invalid-wizard', { wizard: null }),
    "'wizard' must be an object"
  )
  await assertInvalidWizard(
    createManifest('zz-invalid-wizard', { wizard: { visible: 'yes' } }),
    "'wizard.visible' must be a boolean"
  )
  await assertInvalidWizard(
    createManifest('zz-invalid-wizard', {
      wizard: { visible: true, label: '', category: 'Desktop' },
    }),
    "visible wizard feature requires non-empty 'wizard.label'"
  )
  await assertInvalidWizard(
    createManifest('zz-invalid-wizard', {
      wizard: { visible: true, label: 'Invalid wizard fixture', category: '' },
    }),
    "visible wizard feature requires non-empty 'wizard.category'"
  )
  await assertInvalidWizard(
    createManifest('zz-invalid-wizard', {
      wizard: { visible: false, label: 'Hidden implementation detail' },
    }),
    "hidden wizard metadata may only contain 'visible'"
  )
} finally {
  await rm(invalidWizardFeatureDir, { recursive: true, force: true })
}

try {
  await mkdir(invalidFeatureDir, { recursive: true })
  await writeFile(
    path.join(invalidFeatureDir, 'feature.json'),
    `${JSON.stringify(createManifest('zz-invalid-docs', {
      description: 'Invalid fixture with missing declared docs.',
      files: ['docs/features/zz-invalid-docs.md'],
    }), null, 2)}\n`
  )

  const { failed, stderr } = runCheckManifests()
  assert(failed, 'check-manifests should fail when a declared docs file is missing')
  assert(
    stderr.includes("declares missing file 'docs/features/zz-invalid-docs.md'"),
    'check-manifests should report the missing declared docs file'
  )
} finally {
  await rm(invalidFeatureDir, { recursive: true, force: true })
}

try {
  await mkdir(invalidMarkerFeatureDir, { recursive: true })
  await writeFile(
    path.join(invalidMarkerFeatureDir, 'feature.json'),
    `${JSON.stringify(createManifest('zz-invalid-marker', {
      description: 'Invalid fixture with a marker that does not exist in the base app.',
    }), null, 2)}\n`
  )
  await writeFile(
    path.join(invalidMarkerFeatureDir, 'markers.json'),
    `${JSON.stringify([
      {
        id: 'missing-marker',
        file: 'src/App.tsx',
        marker: '// TAURI_CREATOR:DOES_NOT_EXIST',
        insert: 'const missing = true',
      },
    ], null, 2)}\n`
  )

  const { failed, stderr } = runCheckManifests()
  assert(failed, 'check-manifests should fail when a marker is missing from a base file')
  assert(
    stderr.includes("marker '// TAURI_CREATOR:DOES_NOT_EXIST' not found in base file 'src/App.tsx'"),
    'check-manifests should report the missing base marker'
  )
} finally {
  await rm(invalidMarkerFeatureDir, { recursive: true, force: true })
}

console.log('check-manifests negative fixture passed')
