import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
export async function loadFeatureCatalog(root) {
  const entries = await readdir(path.join(root, 'features'), {
    withFileTypes: true,
  })
  const catalog = new Map()
  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(root, 'features', entry.name)
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'feature.json'), 'utf8')
    )
    catalog.set(manifest.name, { dir, manifest })
  }
  return catalog
}
export function resolveFeatures(names, catalog) {
  const resolved = [],
    visiting = new Set(),
    visited = new Set()
  function visit(name) {
    if (visited.has(name)) return
    if (visiting.has(name))
      throw new Error(`cyclic feature dependency involving '${name}'`)
    const entry = catalog.get(name)
    if (!entry) throw new Error(`unknown feature '${name}'`)
    visiting.add(name)
    for (const dependency of entry.manifest.dependsOn ?? []) visit(dependency)
    visiting.delete(name)
    visited.add(name)
    resolved.push(name)
  }
  const closure = new Set()
  function collect(name) {
    if (closure.has(name)) return
    closure.add(name)
    for (const dep of catalog.get(name)?.manifest.dependsOn ?? []) collect(dep)
  }
  names.forEach(collect)
  ;[...closure].sort().forEach(visit)
  for (const name of resolved)
    for (const other of catalog.get(name).manifest.conflictsWith ?? []) {
      if (visited.has(other))
        throw new Error(`feature '${name}' conflicts with '${other}'`)
    }
  return resolved
}
