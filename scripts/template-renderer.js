import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  normalizePackageManager,
  packageManagerInstallCommand,
  packageManagerSetupCommand,
} from './package-managers.js'

function requireStateString(state, field) {
  const value = state?.[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`generated state is missing required template field '${field}'`)
  }
  return value
}

function requireWindowDimension(state, field) {
  const value = state?.window?.[field]
  if (!Number.isInteger(value)) {
    throw new Error(`generated state is missing required template field 'window.${field}'`)
  }
  return String(value)
}

export function templateValuesFromState(state) {
  const packageName = requireStateString(state, 'packageName')
  const productName = requireStateString(state, 'productName')
  const license = requireStateString(state, 'license')
  const packageManager = normalizePackageManager(
    requireStateString(state, 'packageManager'),
    'generated state packageManager'
  )
  const packageManagerPinnedSpec = requireStateString(state, 'packageManagerSpec')

  return {
    APP_AUTHOR: requireStateString(state, 'author'),
    APP_IDENTIFIER: requireStateString(state, 'bundleIdentifier'),
    APP_LICENSE: license,
    APP_NAME: packageName,
    APP_PRODUCT_NAME: productName,
    APP_TITLE: productName,
    APP_WINDOW_HEIGHT: requireWindowDimension(state, 'height'),
    APP_WINDOW_WIDTH: requireWindowDimension(state, 'width'),
    CARGO_LICENSE_LINE: license === 'UNLICENSED' ? '' : `license = "${license}"`,
    CARGO_CRATE_NAME: packageName.replaceAll('-', '_'),
    CARGO_NAME: packageName,
    PACKAGE_MANAGER: packageManager,
    PACKAGE_MANAGER_INSTALL_COMMAND: packageManagerInstallCommand(packageManager),
    PACKAGE_MANAGER_SPEC: packageManagerPinnedSpec,
    PACKAGE_MANAGER_SETUP_COMMAND: packageManagerSetupCommand(
      packageManager,
      packageManagerPinnedSpec
    ),
  }
}

export function replaceTemplateText(text, values) {
  return Object.entries(values).reduce(
    (updated, [key, value]) => updated.replaceAll(`{{${key}}}`, String(value)),
    text
  )
}

export function renderTemplateBuffer(buffer, values) {
  if (buffer.includes(0)) return buffer
  return Buffer.from(replaceTemplateText(buffer.toString('utf8'), values))
}

export async function replaceTemplatesInFiles(root, relativePaths, values) {
  for (const relativePath of [...new Set(relativePaths)]) {
    const filePath = path.join(root, relativePath)
    const original = await readFile(filePath)
    const updated = renderTemplateBuffer(original, values)
    if (!updated.equals(original)) {
      await writeFile(filePath, updated)
    }
  }
}

export async function replaceTemplatesInTree(dir, values) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await replaceTemplatesInTree(fullPath, values)
      continue
    }
    if (!entry.isFile()) continue

    const original = await readFile(fullPath)
    const updated = renderTemplateBuffer(original, values)
    if (!updated.equals(original)) {
      await writeFile(fullPath, updated)
    }
  }
}
