import { featureCli } from './lib/feature-change-plan.js'
try {
  await featureCli('apply', process.argv.slice(2))
} catch (error) {
  console.error(`apply-feature: ${error.message}`)
  process.exitCode = 1
}
