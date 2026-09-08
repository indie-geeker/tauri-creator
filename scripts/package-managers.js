export const defaultPackageManager = 'npm'
export const supportedPackageManagers = ['npm', 'pnpm']

const fallbackVersions = {
  pnpm: '11.7.0',
  npm: '11.6.2',
}

export function normalizePackageManager(
  value,
  optionName = '--package-manager'
) {
  const normalized = String(value ?? defaultPackageManager)
    .trim()
    .toLowerCase()

  if (!supportedPackageManagers.includes(normalized)) {
    throw new Error(
      `${optionName} must be one of: ${supportedPackageManagers.join(', ')}`
    )
  }

  return normalized
}

export function packageManagerVersion(packageManager) {
  return fallbackVersions[normalizePackageManager(packageManager)]
}

export function packageManagerSpec(packageManager) {
  return `${packageManager}@${packageManagerVersion(packageManager)}`
}

export function packageManagerInstallCommand(packageManager) {
  return packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' : 'npm ci'
}

export function packageManagerSetupCommand(
  packageManager,
  packageManagerPinnedSpec
) {
  return `npm install --global ${packageManagerPinnedSpec ?? packageManagerSpec(packageManager)}`
}
