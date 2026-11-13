const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const logFile = path.join(root, 'tests', 'artifacts', 'packaged-log.txt')
fs.writeFileSync(logFile, '')
const log = (message) => {
  fs.appendFileSync(logFile, `${message}\n`)
  console.log(message)
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-packaged')
  fs.rmSync(userData, { recursive: true, force: true })
  const executablePath = process.env.IDLEWISE_EXE || path.join(root, 'dist', 'win-unpacked', 'idlewise.exe')
  log(`launching packaged app: ${path.relative(root, executablePath)}`)
  const app = await electron.launch({
    executablePath,
    args: [],
    env: { ...process.env, IDLEWISE_USERDATA: userData },
  })
  log('electron launched')
  const page = await app.firstWindow()
  log('first window acquired')
  page.on('pageerror', (err) => log(`PAGEERROR ${err.message}`))
  await page.waitForSelector('.app-root', { timeout: 30000 })
  log(`title=${await page.title()}`)
  log(`text=${(await page.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | ')}`)
  await page.screenshot({ path: path.join(root, 'tests', 'artifacts', '50-packaged.png') })
  log('screenshot written')

  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), [
    path.join(root, 'tests', 'fixtures', 'sample.txt'),
    path.join(root, 'tests', 'fixtures', 'sample.pdf'),
  ])
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 2, { timeout: 60000 })
  await page
    .locator('.book-card')
    .filter({ has: page.locator('.book-format', { hasText: 'TXT' }) })
    .first()
    .locator('.book-card-main')
    .click()
  await page.waitForSelector('.txt-body', { timeout: 30000 })
  log('packaged reader opened')
  await page.screenshot({ path: path.join(root, 'tests', 'artifacts', '51-packaged-reader.png') })
  await page.locator('button[aria-label="返回书架"]').first().click()
  await page.waitForSelector('.shelf-header', { timeout: 10000 })
  await page
    .locator('.book-card')
    .filter({ has: page.locator('.book-format', { hasText: 'PDF' }) })
    .first()
    .locator('.book-card-main')
    .click()
  await page.waitForSelector('canvas.pdf-page', { timeout: 40000 })
  await page.waitForTimeout(1200)
  log('packaged pdf opened')
  await page.screenshot({ path: path.join(root, 'tests', 'artifacts', '52-packaged-pdf.png') })
  await app.close()
  log('done')
}

main().catch((err) => {
  log(`FAIL ${err.stack || err}`)
  process.exit(1)
})
