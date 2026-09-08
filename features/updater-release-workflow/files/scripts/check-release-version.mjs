import process from 'node:process'
import { URL } from 'node:url'
import { readFile } from 'node:fs/promises'
const tag = process.env.RELEASE_VERSION
const config = JSON.parse(
  await readFile(
    new URL('../src-tauri/tauri.conf.json', import.meta.url),
    'utf8'
  )
)
const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
)
if (
  !/^v\d+\.\d+\.\d+$/.test(tag ?? '') ||
  tag !== `v${config.version}` ||
  pkg.version !== config.version
) {
  throw new Error(
    `Release tag ${tag} must equal v${config.version} and package.json version`
  )
}
