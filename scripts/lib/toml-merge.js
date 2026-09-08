import { absent, reconcileManagedValue } from './config-merge.js'
// Generated Cargo manifests use single-line values. Unknown/multiline syntax is
// deliberately refused instead of guessing at table boundaries or deleting text.
function parse(text) {
  const lines = text.split('\n'),
    sections = new Map()
  let table = ''
  sections.set(table, { line: -1, keys: new Map() })
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']') && !line.startsWith('[[')) {
      table = line
      if (sections.has(table)) throw new Error(`Duplicate TOML table ${table}`)
      sections.set(table, { line: i, keys: new Map() })
      continue
    }
    const equals = line.indexOf('=')
    if (equals < 1)
      throw new Error(
        `Unsupported TOML syntax at line ${i + 1}; migrate manually`
      )
    const key = line.slice(0, equals).trim(),
      value = line.slice(equals + 1).trim()
    if (
      !value ||
      (value.startsWith('[') && !value.endsWith(']')) ||
      (value.startsWith('{') && !value.endsWith('}'))
    )
      throw new Error(`Unsupported multiline TOML value ${key}`)
    const keys = sections.get(table).keys
    if (keys.has(key)) throw new Error(`Duplicate TOML key ${table}.${key}`)
    keys.set(key, { line: i, value })
  }
  return { lines, sections }
}
export function reconcileToml(current, previous, next) {
  const c = parse(current),
    p = parse(previous),
    n = parse(next),
    adds = new Map(),
    deletes = new Set()
  for (const table of new Set([...p.sections.keys(), ...n.sections.keys()])) {
    const old = p.sections.get(table)?.keys ?? new Map(),
      future = n.sections.get(table)?.keys ?? new Map(),
      present = c.sections.get(table)?.keys ?? new Map()
    for (const key of new Set([...old.keys(), ...future.keys()])) {
      const actual = present.get(key),
        a = old.get(key)?.value ?? absent,
        b = future.get(key)?.value ?? absent
      const value = reconcileManagedValue(
        actual?.value ?? absent,
        a,
        b,
        `Cargo.toml ${table}.${key}`
      )
      if (actual) {
        if (value === absent) deletes.add(actual.line)
        else if (value !== actual.value)
          c.lines[actual.line] = `${key} = ${value}`
      } else if (value !== absent) {
        if (!adds.has(table)) adds.set(table, [])
        adds.get(table).push(`${key} = ${value}`)
      }
    }
  }
  const lines = []
  for (let i = 0; i < c.lines.length; i++) {
    if (!deletes.has(i)) lines.push(c.lines[i])
    for (const [table, section] of c.sections)
      if (section.line === i && adds.has(table)) {
        lines.push(...adds.get(table))
        adds.delete(table)
      }
  }
  for (const [table, values] of adds) lines.push('', table, ...values)
  return lines.join('\n')
}
