/**
 * Post-build existence check for both halves.
 *
 * A missing `lib/client.js` is not a soft failure at runtime: the shell throws
 * `MissingClientBundleError` and the whole clientModules fiber goes FAILED, so
 * the build must refuse to finish without it.
 */
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const artifacts = [
  'lib/index.js',
  'lib/tracker.js',
  'lib/remote.js',
  'lib/usage.js',
  'lib/client.js',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
]

const missing = []
for (const relative of artifacts) {
  try {
    if (statSync(join(root, relative)).size === 0) missing.push(`${relative} (empty)`)
  } catch {
    missing.push(relative)
  }
}

if (missing.length) {
  console.error(`build incomplete — missing artifacts: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`build artifacts ok: ${artifacts.join(', ')}`)
