import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkManifestsScript = path.join(root, 'scripts', 'check-manifests.js')
const invalidFeatureDir = path.join(root, 'features', 'zz-invalid-docs')
const invalidMarkerFeatureDir = path.join(root, 'features', 'zz-invalid-marker')

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

try {
  await mkdir(invalidFeatureDir, { recursive: true })
  await writeFile(
    path.join(invalidFeatureDir, 'feature.json'),
    `${JSON.stringify({
      name: 'zz-invalid-docs',
      description: 'Invalid fixture with missing declared docs.',
      stage: 'v1',
      dependsOn: [],
      conflictsWith: [],
      npmDependencies: [],
      cargoDependencies: [],
      files: ['docs/features/zz-invalid-docs.md'],
      tauriCommands: [],
      spectaExports: [],
      capabilities: [],
      qualityChecks: [],
      removeHints: [],
    }, null, 2)}\n`
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
    `${JSON.stringify({
      name: 'zz-invalid-marker',
      description: 'Invalid fixture with a marker that does not exist in the base app.',
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
    }, null, 2)}\n`
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
