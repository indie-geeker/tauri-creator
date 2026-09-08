import { processCommand } from './process-command.js'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export async function createGeneratedFixture({
  features,
  recipe,
  packageManager = 'npm',
  name,
  keepOutput = false,
  generate = true,
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tauri-contract-'))
  name ??= `contract-${path.basename(directory).slice('tauri-contract-'.length).toLowerCase()}`
  const target = path.join(directory, 'app')
  const logs = path.join(directory, 'logs')
  await mkdir(logs)
  let failed = false
  let sequence = 0
  async function run(command, args, { cwd = target, env = process.env } = {}) {
    const result = await new Promise((resolve) => {
      const executable = processCommand(command, args)
      const child = spawn(executable.command, executable.args, {
        cwd,
        env,
        shell: false,
      })
      let stdout = '',
        stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', (error) => {
        stderr += error.message
      })
      child.on('close', (code) =>
        resolve({ command, args, cwd, exitCode: code ?? 1, stdout, stderr })
      )
    })
    failed ||= result.exitCode !== 0
    await writeFile(
      path.join(logs, `${String(++sequence).padStart(3, '0')}.json`),
      JSON.stringify(result, null, 2)
    )
    return result
  }
  const fixture = {
    directory,
    target,
    logs,
    run,
    async install() {
      return run(packageManager, ['install'])
    },
    async close({ preserve = false } = {}) {
      if (failed || keepOutput || preserve)
        console.log(`Fixture retained: ${directory}`)
      else await rm(directory, { recursive: true, force: true })
    },
  }
  if (generate) {
    const args = [
      path.join(root, 'scripts/create-app.js'),
      '--name',
      name,
      '--target',
      target,
      '--package-manager',
      packageManager,
    ]
    if (features?.length) args.push('--features', features.join(','))
    else args.push('--recipe', recipe ?? 'minimal')
    const result = await run(process.execPath, args, { cwd: root })
    if (result.exitCode) {
      await fixture.close()
      throw new Error(result.stderr || result.stdout)
    }
  }
  return fixture
}
