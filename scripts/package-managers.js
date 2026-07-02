import { execFileSync } from 'node:child_process'

export const defaultPackageManager = 'npm'
export const supportedPackageManagers = ['npm', 'pnpm']

const fallbackVersions = {
  pnpm: '11.7.0',
  npm: '11.6.2',
}

export function normalizePackageManager(value, optionName = '--package-manager') {
  const normalized = String(value ?? defaultPackageManager).trim().toLowerCase()

  if (!supportedPackageManagers.includes(normalized)) {
    throw new Error(`${optionName} must be one of: ${supportedPackageManagers.join(', ')}`)
  }

  return normalized
}

export function packageManagerVersion(packageManager) {
  try {
    const output = execFileSync(packageManager, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const version = output.match(/\d+\.\d+\.\d+/)?.[0]
    return version ?? fallbackVersions[packageManager]
  } catch {
    return fallbackVersions[packageManager]
  }
}

export function packageManagerSpec(packageManager) {
  return `${packageManager}@${packageManagerVersion(packageManager)}`
}
