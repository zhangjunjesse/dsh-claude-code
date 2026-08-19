/**
 * Bundle the client half into `lib/client.js`.
 *
 * The DSH shell loads plugin bundles as CLASSIC scripts and expects the whole
 * file to be one `window.__ModuleLoader__.load({ id, factory })` call, where the
 * id must equal the package name exactly and `factory(require)` returns the
 * module exports. Only the shell's seed module table is resolvable through that
 * `require`, so those specifiers stay external and everything else is inlined.
 *
 * esbuild is the bundler of choice here: the plugin already ships a plain tsc
 * pipeline for the node half, and esbuild adds one small dependency, emits the
 * CJS factory body this contract needs, and supports the banner/footer wrapping
 * without a config-file layer (tsdown/rolldown would pull a much larger tree for
 * a bundle this size).
 */
import { build } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const outfile = join(root, 'lib', 'client.js')

/** Specifiers the shell's module table can resolve at runtime (nothing else). */
const SEED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-app-shell',
  '@deepseek-ai/dsh-client-modules',
]

const banner = [
  `window.__ModuleLoader__.load({`,
  `\tid: ${JSON.stringify(pkg.name)},`,
  `\tfactory: (require) => {`,
  `var module = { exports: {} };`,
  `var exports = module.exports;`,
  '',
].join('\n')

const footer = ['', 'return module.exports;', '}', '});', ''].join('\n')

await build({
  entryPoints: [join(root, 'src', 'client', 'index.ts')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: SEED_MODULES,
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: banner },
  footer: { js: footer },
})

const text = readFileSync(outfile, 'utf8')
if (!text.startsWith('window.__ModuleLoader__.load({')) {
  throw new Error('client bundle is not wrapped in window.__ModuleLoader__.load')
}
if (!text.includes(`id: ${JSON.stringify(pkg.name)}`)) {
  throw new Error(`client bundle id must be exactly ${pkg.name}`)
}
// Every require in the factory must resolve through the shell's seed table.
const required = new Set()
for (const match of text.matchAll(/require\(\s*"([^"]+)"\s*\)/g)) required.add(match[1])
const foreign = [...required].filter((id) => !SEED_MODULES.includes(id))
if (foreign.length) {
  throw new Error(`client bundle requires non-seed modules: ${foreign.join(', ')}`)
}

console.log(`client bundle: lib/client.js (${statSync(outfile).size} bytes, requires: ${[...required].sort().join(', ')})`)
