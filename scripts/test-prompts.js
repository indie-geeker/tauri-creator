import { Readable, Writable } from 'node:stream'
import * as prompts from './prompts.js'

const { createPromptSession } = prompts

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function createScriptedStreams(lines) {
  let transcript = ''
  const input = Readable.from([`${lines.join('\n')}\n`])
  const output = new Writable({
    write(chunk, _encoding, callback) {
      transcript += chunk.toString()
      callback()
    },
  })

  return {
    input,
    output,
    transcript() {
      return transcript
    },
  }
}

{
  const streams = createScriptedStreams(['9', '1', 'x', '1,2'])
  const prompt = createPromptSession(streams)
  try {
    const packageManager = await prompt.choose('Package manager', ['npm', 'pnpm'], 'npm')
    const capabilities = await prompt.chooseMany('Capabilities', ['SQLite', 'Updater'])

    assert(packageManager === 'npm', 'single selection should retry and return the valid choice')
    assert(
      capabilities.join(',') === 'SQLite,Updater',
      'multiple selection should retry and return the valid choices'
    )
    assert(
      streams.transcript().includes('Package manager selection must be a number from 1 to 2'),
      'single selection should explain the valid range'
    )
    assert(
      streams.transcript().includes('Capabilities selection must be a number from 1 to 2'),
      'multiple selection should explain the valid range'
    )
  } finally {
    prompt.close()
  }
}

assert(
  typeof prompts.PromptCancelledError === 'function',
  'prompts should export a typed cancellation error'
)

for (const [caseName, input] of [
  ['EOF', Readable.from([])],
  ['interrupt character', Readable.from(['\u0003\n'])],
]) {
  let cancelled = false
  const output = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  const prompt = createPromptSession({ input, output })
  try {
    await prompt.ask('App name')
  } catch (error) {
    cancelled = error instanceof prompts.PromptCancelledError
  } finally {
    prompt.close()
  }
  assert(cancelled, `${caseName} should cancel the prompt with PromptCancelledError`)
}

assert(
  typeof prompts.promptForCreateAppWizard === 'function',
  'prompts should export the unified create-app wizard'
)

const recipes = [
  { name: 'minimal', description: 'Smallest runnable app.' },
  { name: 'starter', description: 'Recommended production foundation.' },
  { name: 'full', description: 'Reference and regression template.' },
]

const features = [
  {
    name: 'quick-pane',
    label: 'Quick pane',
    category: 'Desktop',
    description: 'Floating quick-entry window.',
  },
  {
    name: 'sqlite',
    label: 'SQLite',
    category: 'Data',
    description: 'Local relational persistence.',
  },
  {
    name: 'updater',
    label: 'Updater',
    category: 'Delivery',
    description: 'Release update integration.',
  },
]

const recipeFeatures = {
  minimal: [],
  starter: ['specta-bindings', 'preferences', 'logging', 'diagnostics'],
  full: ['specta-bindings', 'preferences', 'logging', 'diagnostics', 'ui-layout'],
}

function addUnique(target, value) {
  if (!target.includes(value)) target.push(value)
}

function resolveSelection(recipe, optionalFeatures) {
  const templateFeatures = [...recipeFeatures[recipe]]
  const resolvedFeatures = [...templateFeatures]

  for (const feature of optionalFeatures) {
    if (feature === 'quick-pane') addUnique(resolvedFeatures, 'preferences')
    if (feature === 'updater') addUnique(resolvedFeatures, 'project-governance')
    addUnique(resolvedFeatures, feature)
  }

  return {
    recipeFeatures: templateFeatures,
    requestedFeatures: optionalFeatures,
    automaticFeatures: resolvedFeatures.filter(
      (feature) => !templateFeatures.includes(feature) && !optionalFeatures.includes(feature)
    ),
    resolvedFeatures,
  }
}

const defaultValidators = {
  name(value) {
    if (value === 'bad-name') throw new Error('Project name is invalid')
    return value.trim()
  },
  target(value) {
    if (value === 'occupied') throw new Error('Target directory is not empty')
    return value
  },
  bundleIdentifierPrefix(value) {
    if (value === 'bad-prefix') throw new Error('Bundle identifier prefix is invalid')
    return value
  },
  author: (value) => value,
  license: (value) => value,
  windowWidth(value) {
    if (Number(value) < 320) throw new Error('Window width must be at least 320')
    return value
  },
  windowHeight: (value) => value,
}

async function runWizard(lines, overrides = {}) {
  const streams = createScriptedStreams(lines)
  const result = await prompts.promptForCreateAppWizard({
    recipes,
    features,
    packageManagers: ['npm', 'pnpm'],
    defaultPackageManager: 'npm',
    defaultTargetForName: (name) => `/tmp/${name}`,
    validators: {
      ...defaultValidators,
      ...overrides.validators,
    },
    resolveSelection,
    ...overrides,
    input: streams.input,
    output: streams.output,
  })

  return { result, transcript: streams.transcript() }
}

{
  const { result, transcript } = await runWizard([
    'bad-name',
    'demo-app',
    'occupied',
    '/tmp/demo-app',
    '',
    '',
    '',
    'bad-prefix',
    'com.example',
    '',
    '',
  ])

  assert(result.name === 'demo-app', 'wizard should return the validated project name')
  assert(result.target === '/tmp/demo-app', 'wizard should return the validated target')
  assert(result.recipe === 'starter', 'Starter should be the default template')
  assert(result.optionalFeatures.length === 0, 'optional capabilities should default to none')
  assert(result.packageManager === 'npm', 'package manager should use its default')
  assert(
    result.bundleIdentifierPrefix === 'com.example',
    'wizard should return the validated bundle prefix'
  )
  assert(transcript.includes('Project name is invalid'), 'invalid names should be explained')
  assert(
    transcript.includes('Target directory is not empty'),
    'invalid targets should be explained and retried'
  )
  assert(
    transcript.includes('Bundle identifier prefix is invalid'),
    'invalid bundle prefixes should be explained and retried'
  )
  assert(transcript.includes('Template: starter'), 'summary should show the selected template')
  assert(
    transcript.includes('Requested capabilities: none'),
    'summary should show that no optional capability was requested'
  )
}

{
  const { result, transcript } = await runWizard([
    'capability-demo',
    '/tmp/capability-demo',
    '1',
    '2',
    '1,3',
    '',
    '',
    '',
    '',
  ])

  assert(result.recipe === 'minimal', 'wizard should allow the Minimal template')
  assert(
    result.optionalFeatures.join(',') === 'quick-pane,updater',
    'wizard should map capability labels back to feature names'
  )
  assert(
    transcript.includes('Requested capabilities: Quick pane, Updater'),
    'summary should use friendly labels for requested capabilities'
  )
  assert(
    transcript.includes('Automatic dependencies: preferences, project-governance'),
    'summary should disclose automatically resolved dependencies'
  )
  assert(
    transcript.includes('Resolved features: preferences, quick-pane, project-governance, updater'),
    'summary should show the complete resolved feature set'
  )
  const capabilityMenu = transcript.slice(
    transcript.indexOf('Optional capabilities options:'),
    transcript.indexOf('Select optional capabilities')
  )
  assert(capabilityMenu.includes('[Desktop] Quick pane'), 'capability menu should group visible features')
  assert(!capabilityMenu.includes('Preferences'), 'capability menu should not expose hidden dependencies')
}

{
  let attempts = 0
  const { result, transcript } = await runWizard(
    [
      'conflict-demo',
      '/tmp/conflict-demo',
      '1',
      '2',
      '2',
      '1',
      '',
      '',
      '',
      '',
    ],
    {
      resolveSelection(recipe, optionalFeatures) {
        attempts += 1
        if (optionalFeatures.includes('sqlite')) {
          throw new Error('SQLite conflicts with this selection')
        }
        return resolveSelection(recipe, optionalFeatures)
      },
    }
  )

  assert(attempts === 2, 'resolution errors should retry capability selection')
  assert(
    result.optionalFeatures.join(',') === 'quick-pane',
    'retry should use the corrected capability selection'
  )
  assert(
    transcript.includes('SQLite conflicts with this selection'),
    'resolution errors should be shown before retrying'
  )
}

{
  const { result, transcript } = await runWizard([
    'back-demo',
    '/tmp/back-demo',
    '3',
    '',
    '',
    '',
    '',
    '2',
    '1',
    '',
    '',
    '',
    '',
    '1',
  ])

  assert(result.recipe === 'minimal', 'Back should allow replacing the template selection')
  assert(
    transcript.match(/Project name/g)?.length === 1,
    'Back should retain the validated project name'
  )
  assert(
    transcript.match(/Template options:/g)?.length === 2,
    'Back should return to template selection'
  )
}

{
  const { result, transcript } = await runWizard([
    'advanced-demo',
    '/tmp/advanced-demo',
    '3',
    '',
    '2',
    'org.example',
    '2',
    'Wen',
    'MIT',
    '100',
    '1200',
    '760',
    '1',
    '',
  ])

  assert(result.recipe === 'full', 'wizard should allow the Full regression recipe')
  assert(result.packageManager === 'pnpm', 'wizard should allow pnpm')
  assert(result.author === 'Wen', 'advanced settings should capture author')
  assert(result.license === 'MIT', 'advanced settings should capture license')
  assert(result.windowWidth === '1200', 'advanced settings should retry invalid widths')
  assert(result.windowHeight === '760', 'advanced settings should capture height')
  assert(result.sidebar === 'left', 'layout-aware advanced settings should capture sidebar')
  assert(
    transcript.includes('Window width must be at least 320'),
    'advanced validation errors should be explained'
  )
  assert(
    transcript.includes('Sidebar layout options:'),
    'sidebar should be asked when ui-layout is resolved'
  )
}

{
  let cancelled = false
  try {
    await runWizard([
      'cancel-demo',
      '/tmp/cancel-demo',
      '',
      '',
      '',
      '',
      '',
      '3',
    ])
  } catch (error) {
    cancelled = error instanceof prompts.PromptCancelledError
  }
  assert(cancelled, 'Cancel should stop the wizard with PromptCancelledError')
}

console.log('prompt interaction tests passed')
