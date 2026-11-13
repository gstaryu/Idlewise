import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const raw = process.argv.slice(2)
const dryRun = raw.includes('--dry-run')
const args = raw.filter((item) => item !== '--dry-run')
const name = args[0]
const appId = args[1]
const slugArg = args[2]

if (!name || !appId) {
  console.error('用法: npm run rename -- "新名字" com.example.app [slug] [--dry-run]')
  process.exit(1)
}

const slug = slugArg || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'idlewise'
const changes = []

function replaceInFile(relative, replacements) {
  const file = path.join(root, relative)
  let content = fs.readFileSync(file, 'utf8')
  for (const [pattern, replacement] of replacements) {
    const next = content.replace(pattern, replacement)
    if (next !== content) changes.push(`${relative}: ${pattern} -> ${replacement}`)
    content = next
  }
  if (!dryRun) fs.writeFileSync(file, content)
}

replaceInFile('lib/shared/branding.ts', [
  [/export const APP_NAME = '[^']*'/, `export const APP_NAME = '${name}'`],
  [/export const APP_ID = '[^']*'/, `export const APP_ID = '${appId}'`],
])

const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
if (pkg.name !== slug) {
  changes.push(`package.json: name ${pkg.name} -> ${slug}`)
  pkg.name = slug
}
if (!dryRun) fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

replaceInFile('electron-builder.yml', [
  [/^appId: .*$/m, `appId: ${appId}`],
  [/^productName: .*$/m, `productName: ${name}`],
  [/^  executableName: .*$/m, `  executableName: ${slug}`],
])

console.log(changes.length ? changes.join('\n') : '没有需要修改的内容')
if (dryRun) console.log('（dry-run：未写入文件）')
