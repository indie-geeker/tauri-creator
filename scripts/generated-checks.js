import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
export function renderCheckScripts(state) {
  const features = new Set(state.enabledFeatures ?? [])
  const steps = []
  if (features.has('specta-bindings')) steps.push('bindings:check')
  steps.push('typecheck')
  if (features.has('dx-tools')) steps.push('lint', 'ast:lint', 'format:check')
  steps.push('rust:fmt:check')
  if (features.has('dx-tools')) steps.push('rust:clippy')
  steps.push('test:run', 'rust:test')
  return {
    'rust:fmt': 'cargo fmt --manifest-path src-tauri/Cargo.toml',
    'rust:fmt:check': 'cargo fmt --check --manifest-path src-tauri/Cargo.toml',
    'rust:test': 'cargo test --manifest-path src-tauri/Cargo.toml',
    'check:all': steps
      .map((step) => `${state.packageManager ?? 'npm'} run ${step}`)
      .join(' && '),
  }
}
export async function syncCheckScripts(target, state) {
  const file = path.join(target, 'package.json')
  const pkg = JSON.parse(await readFile(file, 'utf8'))
  Object.assign(pkg.scripts, renderCheckScripts(state))
  await writeFile(file, JSON.stringify(pkg, null, 2) + '\n')
}
