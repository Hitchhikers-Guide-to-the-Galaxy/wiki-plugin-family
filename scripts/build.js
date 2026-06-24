import esbuild from 'esbuild'
import { writeFileSync } from 'node:fs'

const result = await esbuild.build({
  entryPoints: ['src/client/family.js'],
  bundle: true,
  format: 'iife',
  outfile: 'client/family.js',
  sourcemap: true,
  minify: true,
  metafile: true,
})

writeFileSync('meta-client.json', JSON.stringify(result.metafile))
console.log('built client/family.js')
