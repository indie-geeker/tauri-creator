import { featureCli } from './lib/feature-change-plan.js'
try {
  await featureCli('remove', process.argv.slice(2))
} catch (error) {
  console.error(`remove-feature: ${error.message}`)
  process.exitCode = 1
}
