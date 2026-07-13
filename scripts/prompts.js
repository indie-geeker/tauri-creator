import { stdin as defaultInput, stdout as defaultOutput } from 'node:process'
import { createInterface } from 'node:readline'

export class PromptCancelledError extends Error {
  constructor(message = 'Project creation cancelled') {
    super(message)
    this.name = 'PromptCancelledError'
  }
}

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
  let interrupted = false

  readline.on('SIGINT', () => {
    interrupted = true
    readline.close()
  })

  return {
    async ask(label, defaultValue = '') {
      const suffix = defaultValue ? ` [${defaultValue}]` : ''
      output.write(`${label}${suffix}: `)
      const nextLine = await lines.next()
      if (interrupted || nextLine.done) {
        throw new PromptCancelledError()
      }
      const answer = nextLine.value
      if (answer.includes('\u0003')) {
        throw new PromptCancelledError()
      }
      const trimmed = answer.trim()
      return trimmed === '' ? defaultValue : trimmed
    },
    async askValidated(label, defaultValue = '', validate = (value) => value) {
      while (true) {
        const answer = await this.ask(label, defaultValue)
        try {
          return await validate(answer)
        } catch (error) {
          if (error instanceof PromptCancelledError) throw error
          output.write(`${error.message}\n`)
        }
      }
    },
    async choose(label, options, defaultValue = '') {
      output.write(`${formatOptionList(label, options)}\n`)
      const defaultIndex = optionIndexForValue(options, defaultValue)
      while (true) {
        const answer = await this.ask(`Select ${label.toLowerCase()}`, defaultIndex)
        try {
          return options[parseSelectedIndex(answer, options, label)]
        } catch (error) {
          output.write(`${error.message}\n`)
        }
      }
    },
    async chooseMany(label, options) {
      output.write(`${formatOptionList(label, options)}\n`)
      while (true) {
        const answer = await this.ask(
          `Select ${label.toLowerCase()}, comma-separated, or Enter for none`,
          ''
        )
        try {
          return parseSelectedIndexes(answer, options, label).map((index) => options[index])
        } catch (error) {
          output.write(`${error.message}\n`)
        }
      }
    },
    close() {
      readline.close()
    },
  }
}

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function recipeOption(recipe) {
  return `${titleCase(recipe.name)} — ${recipe.description}`
}

function featureOption(feature) {
  return `[${feature.category}] ${feature.label} — ${feature.description}`
}

function friendlyFeatureList(featureNames, featureByName) {
  if (featureNames.length === 0) return 'none'
  return featureNames
    .map((featureName) => featureByName.get(featureName)?.label ?? featureName)
    .join(', ')
}

function rawFeatureList(featureNames) {
  return featureNames.length === 0 ? 'none' : featureNames.join(', ')
}

function writeWizardSummary(output, values, preview, featureByName) {
  output.write('\nProject summary\n')
  output.write(`  Project: ${values.name}\n`)
  output.write(`  Target: ${values.target}\n`)
  output.write(`  Template: ${values.recipe}\n`)
  output.write(
    `  Requested capabilities: ${friendlyFeatureList(values.optionalFeatures, featureByName)}\n`
  )
  output.write(`  Automatic dependencies: ${rawFeatureList(preview.automaticFeatures)}\n`)
  output.write(`  Resolved features: ${rawFeatureList(preview.resolvedFeatures)}\n`)
  output.write(`  Package manager: ${values.packageManager}\n`)
  output.write(`  Bundle identifier prefix: ${values.bundleIdentifierPrefix}\n`)
  if (
    values.author !== 'you' ||
    values.license !== 'UNLICENSED' ||
    values.windowWidth !== '1000' ||
    values.windowHeight !== '700' ||
    values.sidebar !== 'both'
  ) {
    output.write(
      `  Advanced: author=${values.author}, license=${values.license}, window=${values.windowWidth}x${values.windowHeight}, sidebar=${values.sidebar}\n`
    )
  }
  output.write('\n')
}

export async function promptForCreateAppWizard({
  recipes,
  features,
  packageManagers,
  defaultPackageManager,
  defaultTargetForName,
  validators = {},
  resolveSelection,
  input = defaultInput,
  output = defaultOutput,
} = {}) {
  const prompt = createPromptSession({ input, output })
  const validate = {
    name: validators.name ?? ((value) => value),
    target: validators.target ?? ((value) => value),
    bundleIdentifierPrefix:
      validators.bundleIdentifierPrefix ?? ((value) => value),
    author: validators.author ?? ((value) => value),
    license: validators.license ?? ((value) => value),
    windowWidth: validators.windowWidth ?? ((value) => value),
    windowHeight: validators.windowHeight ?? ((value) => value),
  }
  const recipeOptions = recipes.map(recipeOption)
  const recipeByOption = new Map(recipes.map((recipe) => [recipeOption(recipe), recipe]))
  const starter = recipes.find((recipe) => recipe.name === 'starter') ?? recipes[0]
  const defaultRecipeOption = starter ? recipeOption(starter) : ''
  const featureByName = new Map(features.map((feature) => [feature.name, feature]))

  try {
    const name = await prompt.askValidated('Project name', '', validate.name)
    const target = await prompt.askValidated(
      'Target directory',
      defaultTargetForName(name),
      validate.target
    )

    while (true) {
      const selectedRecipeOption = await prompt.choose(
        'Template',
        recipeOptions,
        defaultRecipeOption
      )
      const recipe = recipeByOption.get(selectedRecipeOption)
      const templateFeatures = new Set(recipe.resolvedFeatures ?? [])
      const availableFeatures = features.filter((feature) => !templateFeatures.has(feature.name))
      const availableFeatureOptions = availableFeatures.map(featureOption)
      const featureByOption = new Map(
        availableFeatures.map((feature) => [featureOption(feature), feature])
      )
      let optionalFeatures = []
      let preview

      if (availableFeatures.length > 0) {
        const addCapabilities = await prompt.choose(
          'Add optional capabilities?',
          ['No', 'Yes'],
          'No'
        )
        if (addCapabilities === 'Yes') {
          while (true) {
            const selectedOptions = await prompt.chooseMany(
              'Optional capabilities',
              availableFeatureOptions
            )
            optionalFeatures = selectedOptions.map(
              (option) => featureByOption.get(option).name
            )
            try {
              preview = await resolveSelection(recipe.name, optionalFeatures)
              break
            } catch (error) {
              output.write(`Unable to resolve capabilities: ${error.message}\n`)
            }
          }
        }
      }

      if (!preview) {
        try {
          preview = await resolveSelection(recipe.name, optionalFeatures)
        } catch (error) {
          output.write(`Unable to use template '${recipe.name}': ${error.message}\n`)
          continue
        }
      }

      const packageManager = await prompt.choose(
        'Package manager',
        packageManagers,
        defaultPackageManager
      )
      const bundleIdentifierPrefix = await prompt.askValidated(
        'Bundle identifier prefix',
        'com.local',
        validate.bundleIdentifierPrefix
      )
      const customizeAdvanced = await prompt.choose(
        'Customize advanced settings?',
        ['No', 'Yes'],
        'No'
      )

      let author = 'you'
      let license = 'UNLICENSED'
      let windowWidth = '1000'
      let windowHeight = '700'
      let sidebar = 'both'

      if (customizeAdvanced === 'Yes') {
        author = await prompt.askValidated('Author', 'you', validate.author)
        license = await prompt.askValidated('License', 'UNLICENSED', validate.license)
        windowWidth = await prompt.askValidated('Window width', '1000', validate.windowWidth)
        windowHeight = await prompt.askValidated('Window height', '700', validate.windowHeight)
        if (preview.resolvedFeatures.includes('ui-layout')) {
          sidebar = await prompt.choose(
            'Sidebar layout',
            ['left', 'right', 'both'],
            'both'
          )
        }
      }

      const values = {
        name,
        target,
        recipe: recipe.name,
        optionalFeatures,
        packageManager,
        bundleIdentifierPrefix,
        author,
        license,
        windowWidth,
        windowHeight,
        sidebar,
      }
      writeWizardSummary(output, values, preview, featureByName)

      const action = await prompt.choose(
        'Next action',
        ['Create', 'Back', 'Cancel'],
        'Create'
      )
      if (action === 'Cancel') throw new PromptCancelledError()
      if (action === 'Back') continue

      return { ...values, selectionPreview: preview }
    }
  } finally {
    prompt.close()
  }
}
