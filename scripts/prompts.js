import { stdin as defaultInput, stdout as defaultOutput } from 'node:process'
import { createInterface } from 'node:readline'

export function parseCommaList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatOptionList(label, options) {
  return [
    `${label} options:`,
    ...options.map((option, index) => `  ${index + 1}. ${option}`),
  ].join('\n')
}

function optionIndexForValue(options, value) {
  const index = options.indexOf(value)
  return index === -1 ? '' : String(index + 1)
}

function parseSelectedIndex(value, options, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < 1 || parsed > options.length) {
    throw new Error(`${label} selection must be a number from 1 to ${options.length}`)
  }
  return parsed - 1
}

function parseSelectedIndexes(value, options, label) {
  if (!value.trim()) return []

  const seen = new Set()
  const selected = []
  for (const item of parseCommaList(value)) {
    const index = parseSelectedIndex(item, options, label)
    if (seen.has(index)) continue
    seen.add(index)
    selected.push(index)
  }

  return selected
}

export function createPromptSession({
  input = defaultInput,
  output = defaultOutput,
} = {}) {
  const readline = createInterface({ input, output })
  const lines = readline[Symbol.asyncIterator]()

  return {
    async ask(label, defaultValue = '') {
      const suffix = defaultValue ? ` [${defaultValue}]` : ''
      output.write(`${label}${suffix}: `)
      const nextLine = await lines.next()
      const answer = nextLine.done ? '' : nextLine.value
      const trimmed = answer.trim()
      return trimmed === '' ? defaultValue : trimmed
    },
    async choose(label, options, defaultValue = '') {
      output.write(`${formatOptionList(label, options)}\n`)
      const defaultIndex = optionIndexForValue(options, defaultValue)
      const answer = await this.ask(`Select ${label.toLowerCase()}`, defaultIndex)
      return options[parseSelectedIndex(answer, options, label)]
    },
    async chooseMany(label, options) {
      output.write(`${formatOptionList(label, options)}\n`)
      const answer = await this.ask(
        `Select ${label.toLowerCase()}, comma-separated, or Enter for none`,
        ''
      )
      return parseSelectedIndexes(answer, options, label).map((index) => options[index])
    },
    close() {
      readline.close()
    },
  }
}

export async function promptForQuickCreateApp({
  packageManagers,
  defaultPackageManager,
  defaultTargetForName,
  input = defaultInput,
  output = defaultOutput,
} = {}) {
  const prompt = createPromptSession({ input, output })

  try {
    const name = await prompt.ask('App name')
    const target = await prompt.ask('Target path', defaultTargetForName(name))
    const bundleIdentifierPrefix = await prompt.ask('Bundle identifier prefix', 'com.local')
    const packageManager = await prompt.choose(
      'Package manager',
      packageManagers,
      defaultPackageManager
    )

    return {
      name,
      target,
      recipe: 'starter',
      optionalFeatures: [],
      sidebar: 'both',
      author: 'you',
      bundleIdentifierPrefix,
      windowWidth: '1000',
      windowHeight: '700',
      license: 'UNLICENSED',
      packageManager,
    }
  } finally {
    prompt.close()
  }
}

export async function promptForAdvancedCreateApp({
  recipes,
  features,
  packageManagers,
  defaultPackageManager,
  defaultTargetForName,
  input = defaultInput,
  output = defaultOutput,
} = {}) {
  const prompt = createPromptSession({ input, output })

  try {
    const recipeDefault = recipes.includes('minimal') ? 'minimal' : (recipes[0] ?? '')
    const name = await prompt.ask('App name')
    const target = await prompt.ask('Target path', defaultTargetForName(name))
    const integrationModeLabel = await prompt.choose(
      'Integration mode',
      ['Feature integration', 'Recipe integration'],
      'Feature integration'
    )
    const integrationMode =
      integrationModeLabel === 'Recipe integration' ? 'recipe' : 'features'
    const recipe =
      integrationMode === 'recipe'
        ? await prompt.choose('Recipe', recipes, recipeDefault)
        : null
    const optionalFeatures =
      integrationMode === 'features'
        ? await prompt.chooseMany('Feature', features)
        : []
    const includesLayout =
      recipe === 'full' || optionalFeatures.includes('ui-layout')
    const sidebar = includesLayout
      ? await prompt.choose('Sidebar layout', ['left', 'right', 'both'], 'both')
      : 'both'
    const author = await prompt.ask('Author', 'you')
    const bundleIdentifierPrefix = await prompt.ask('Bundle identifier prefix', 'com.local')
    const windowWidth = await prompt.ask('Window width', '1000')
    const windowHeight = await prompt.ask('Window height', '700')
    const license = await prompt.ask('License', 'UNLICENSED')
    const packageManager = await prompt.choose(
      'Package manager',
      packageManagers,
      defaultPackageManager
    )

    return {
      name,
      target,
      integrationMode,
      recipe,
      optionalFeatures,
      sidebar,
      author,
      bundleIdentifierPrefix,
      windowWidth,
      windowHeight,
      license,
      packageManager,
    }
  } finally {
    prompt.close()
  }
}
