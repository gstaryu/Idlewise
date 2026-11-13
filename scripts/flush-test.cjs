const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log('PASS', name, detail)
  else {
    failures += 1
    console.log('FAIL', name, detail)
  }
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-flush')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1000)
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])

  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), [
    path.join(root, 'tests', 'fixtures', 'sample.txt'),
  ])
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 1, { timeout: 60000 })
  const books = await invoke('library:list')
  const book = books.find((item) => item.format === 'txt')
  check('book imported', Boolean(book), JSON.stringify(book && { id: book.id, format: book.format }))

  await invoke('library:set-progress', { id: book.id, progress: 0.42, location: '0.42' })
  await invoke('settings:update', { reader: { fontSize: 37 } })
  // Immediate quit: async JSON writes have not had a chance to flush.
  await app.close()

  const library = JSON.parse(fs.readFileSync(path.join(userData, 'library.json'), 'utf8'))
  const persisted = library.books.find((item) => item.id === book.id)
  check('library flush on quit', persisted && Math.abs(persisted.progress - 0.42) < 0.001, JSON.stringify(persisted && persisted.progress))
  const settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'))
  check('settings flush on quit', settings.reader && settings.reader.fontSize === 37, JSON.stringify(settings.reader && settings.reader.fontSize))

  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('FLUSH TEST FAILED', err)
  process.exit(1)
})
