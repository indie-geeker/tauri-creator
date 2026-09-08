/** Deterministic JSON with short primitive arrays, matching the template formatter. */
export function formatJson(value) {
  const source = JSON.stringify(value, null, 2)
  return (
    source.replace(/\[\n[^\[\]]*?\n\s*\]/g, (text, offset) => {
      let array
      try {
        array = JSON.parse(text)
      } catch {
        return text
      }
      if (
        !Array.isArray(array) ||
        array.some((item) => item !== null && typeof item === 'object')
      )
        return text
      // Use JSON rendering per item so commas inside string values remain untouched.
      const rendered =
        '[' + array.map((item) => JSON.stringify(item)).join(', ') + ']'
      const prefix = source.slice(source.lastIndexOf('\n', offset) + 1, offset)
      return prefix.length + rendered.length + 1 <= 80 ? rendered : text
    }) + '\n'
  )
}
