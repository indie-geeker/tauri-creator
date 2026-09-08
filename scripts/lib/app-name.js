// One naming contract for npm, Cargo and the interactive wizard.
export function normalizeAppName(rawName, optionName = '--name') {
  const appName = String(rawName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/_+/g, '-')
  if (
    !/^[a-z][a-z0-9-]*$/.test(appName) ||
    ['self', 'super', 'crate', 'std', 'test', 'core', 'alloc'].includes(appName)
  ) {
    throw new Error(
      `${optionName} '${rawName}' normalizes to '${appName}'; use a name starting with a letter followed by letters, numbers or hyphens (for example my-app)`
    )
  }
  return appName
}
