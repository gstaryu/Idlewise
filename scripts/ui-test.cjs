const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')
fs.mkdirSync(out, { recursive: true })

const fixtures = [
  path.join(root, 'tests', 'fixtures', 'sample.epub'),
  path.join(root, 'tests', 'fixtures', 'sample.pdf'),
  path.join(root, 'tests', 'fixtures', 'sample.txt'),
  path.join(root, 'tests', 'fixtures', 'alice.mobi'),
  path.join(root, 'tests', 'fixtures', 'alice.azw3'),
]

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('SHOT', name)
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-ui')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) console.log('[renderer]', msg.type(), msg.text())
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)

  await page.evaluate((paths) => {
    window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths }))
  }, fixtures)

  try {
    await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 5, { timeout: 90000 })
  } catch {
    console.log('IMPORTED COUNT', await page.locator('.book-card').count())
    console.log('BODY', (await page.locator('body').innerText()).slice(0, 3000))
    throw new Error('import did not reach 5 books')
  }
  console.log('BOOKS:', await page.locator('.book-meta p:first-child').allTextContents())
  await shot(page, '01-bookshelf')

  const cases = [
    { match: 'Idlewise PDF', selector: 'canvas.pdf-page', name: '02-reader-pdf' },
    { match: 'sample', selector: '.txt-body', name: '03-reader-txt' },
    { match: '欢迎使用', selector: 'foliate-view', name: '04-reader-epub' },
    { match: "Alice", selector: 'foliate-view', name: '05-reader-mobi' },
  ]
  for (const item of cases) {
    const card = page.locator('.book-card').filter({ hasText: item.match }).first()
    if ((await card.count()) === 0) {
      console.log('MISSING BOOK', item.match)
      continue
    }
    await card.locator('.book-card-main').click()
    await page.waitForSelector('.reading-header', { timeout: 20000 })
    try {
      await page.waitForSelector(item.selector, { timeout: 40000 })
    } catch {
      console.log('VIEWER TIMEOUT', item.name, (await page.locator('body').innerText()).slice(0, 1000))
    }
    await page.waitForTimeout(2200)
    await shot(page, item.name)
    const back = page.locator('button[aria-label="返回书架"]')
    if (await back.count()) await back.first().click()
    await page.waitForTimeout(500)
  }

  // 打开最后一个 AZW3，单独验证（与 MOBI 相同解析器，但扩展名不同）
  const azw = page.locator('.book-card').filter({ hasText: 'Alice' }).last()
  if (await azw.count()) {
    await azw.locator('.book-card-main').click()
    await page.waitForSelector('foliate-view', { timeout: 40000 }).catch(() => {})
    await page.waitForTimeout(1800)
    await shot(page, '06-reader-azw3')
    await page.locator('button[aria-label="返回书架"]').first().click()
  }

  console.log('WINDOW INFO', JSON.stringify(await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return { bounds: win.getBounds(), visible: win.isVisible(), opacity: win.getOpacity(), alwaysOnTop: win.isAlwaysOnTop() }
  })))

  await app.close()
}

main().catch((err) => {
  console.error('UI TEST FAILED', err)
  process.exit(1)
})
