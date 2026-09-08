import { isDeepStrictEqual as equal } from 'node:util'
export const absent = Symbol('absent')
const object = (v) =>
  v !== absent && v !== null && typeof v === 'object' && !Array.isArray(v)
/** Three-way reconciliation preserves unmanaged keys; changed managed leaves require proof. */
export function reconcileManagedValue(
  current,
  previous,
  next,
  location = 'config'
) {
  if (equal(current, previous)) return next
  if (equal(previous, next)) return current
  if (
    object(current) &&
    (object(previous) || previous === absent) &&
    (object(next) || next === absent)
  ) {
    const result = { ...current }
    for (const key of new Set([
      ...Object.keys(previous === absent ? {} : previous),
      ...Object.keys(next === absent ? {} : next),
    ])) {
      const value = reconcileManagedValue(
        Object.hasOwn(current, key) ? current[key] : absent,
        Object.hasOwn(previous === absent ? {} : previous, key)
          ? previous[key]
          : absent,
        Object.hasOwn(next === absent ? {} : next, key) ? next[key] : absent,
        `${location}.${key}`
      )
      if (value === absent) delete result[key]
      else result[key] = value
    }
    return Object.keys(result).length || next !== absent ? result : absent
  }
  if (
    Array.isArray(current) &&
    Array.isArray(previous) &&
    Array.isArray(next)
  ) {
    if (location.endsWith('.windows')) {
      const keyed = (values) =>
        new Map(
          values.map((value) => {
            if (!value?.label)
              throw new Error(`Missing window label: ${location}`)
            return [value.label, value]
          })
        )
      const c = keyed(current),
        p = keyed(previous),
        n = keyed(next)
      if (
        c.size !== current.length ||
        p.size !== previous.length ||
        n.size !== next.length
      )
        throw new Error(`Duplicate window label: ${location}`)
      for (const label of new Set([...p.keys(), ...n.keys()])) {
        const value = reconcileManagedValue(
          c.get(label) ?? absent,
          p.get(label) ?? absent,
          n.get(label) ?? absent,
          `${location}[${label}]`
        )
        if (value === absent) c.delete(label)
        else c.set(label, value)
      }
      return [...c.values()]
    }
    // Primitive permission/config sets: remove only old managed members and preserve user additions.
    if (
      [...current, ...previous, ...next].every((v) => typeof v === 'string')
    ) {
      for (const item of previous)
        if (!current.includes(item) && next.includes(item))
          throw new Error(`Modified managed array: ${location}`)
      return [
        ...new Set([
          ...current.filter((v) => !previous.includes(v) || next.includes(v)),
          ...next,
        ]),
      ]
    }
  }
  throw new Error(`Modified managed value: ${location}`)
}
