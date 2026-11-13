const { _electron: electron } = require('@playwright/test')
const path = require('path')
const http = require('http')
const fs = require('fs')

async function main() {
  const root = path.resolve(__dirname, '..')
  const server = http.createServer((req, res) => {
    const file = path.join(root, 'tests', 'fixtures', (req.url || '/page.html').replace(/^\//, ''))
    try {
      res.end(fs.readFileSync(file))
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  })
  await new Promise((resolve) => server.listen(8125, '127.0.0.1', resolve))
  const app = await electron.launch(
    process.env.IDLEWISE_EXE
      ? {
          executablePath: process.env.IDLEWISE_EXE,
          args: [],
          env: {
            ...process.env,
            IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-font-${Date.now()}`),
          },
        }
      : {
          args: ['.'],
          cwd: root,
          env: {
            ...process.env,
            IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-font-${Date.now()}`),
            ELECTRON_DISABLE_SANDBOX: '1',
          },
        }
  )
  let failures = 0
  const check = (name, ok, detail = '') => {
    console.log(ok ? 'PASS' : 'FAIL', name, detail)
    if (!ok) failures += 1
  }
  const overlayPage = async () => {
    for (let i = 0; i < 40; i += 1) {
      const found = app.windows().find((win) => win.url().startsWith('data:text/html'))
      if (found) {
        await found.waitForSelector('#panel', { timeout: 5000 })
        return found
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('overlay window not found')
  }
  const webColor = () =>
    app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents().find((item) => item.getURL().includes('page.html'))
      if (!wc) return ''
      return wc.executeJavaScript('getComputedStyle(document.body).color')
    })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })

    await page.locator('button[aria-label="浏览"]').first().click()
    const address = page.getByPlaceholder('搜索或输入网址')
    await address.fill('http://127.0.0.1:8125/page.html')
    await address.press('Enter')
    await page.waitForTimeout(1500)

    await page.locator('button[aria-label="字体颜色"]').click()
    const overlay = await overlayPage()
    check('font color overlay opens instead of settings', (await overlay.locator('#title').innerText()) === '字体颜色')
    check('font color overlay has no settings tabs', (await page.locator('[data-testid="settings-panel"]').count()) === 0)
    const windowMetrics = await app.evaluate(({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows()
      const main = all.find((win) => !win.webContents.getURL().startsWith('data:text/html'))
      const panel = all.find((win) => win.webContents.getURL().startsWith('data:text/html'))
      return { main: main?.getBounds(), panel: panel?.getBounds() }
    })
    check(
      'font color overlay is a small panel',
      Boolean(windowMetrics.panel && windowMetrics.main) &&
        windowMetrics.panel.width < windowMetrics.main.width * 0.6 &&
        windowMetrics.panel.height < windowMetrics.main.height * 0.9,
      JSON.stringify(windowMetrics)
    )
    check('main interface stays visible behind overlay', await page.locator('.app-root').isVisible())
    await overlay.locator('input[type=color]').first().evaluate((el) => {
      el.value = '#123456'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(300)
    const previewed = await webColor()
    check('web text color previews while picking', previewed.replace(/\s/g, '') === 'rgb(18,52,86)', previewed)
    await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'font-color-main-visible.png') })
    await overlay.locator('.swatch[title="#7a2f2f"]').nth(0).click()
    await page.waitForTimeout(500)
    const colored = await webColor()
    check('web text color applies live', colored.replace(/\s/g, '') === 'rgb(122,47,47)', colored)
    await overlay.screenshot({ path: path.join(root, 'tests', 'artifacts', 'font-color-overlay.png') })
    await overlay.locator('label.sw').first().locator('input').click()
    await page.waitForTimeout(500)
    const restored = await webColor()
    check('web text color restores original', restored.replace(/\s/g, '') === 'rgb(29,27,23)', restored)
    await overlay.locator('label.sw').first().locator('input').click()
    await page.waitForTimeout(400)
    await overlay.locator('#close').click()
    await page.waitForTimeout(300)

    await page.locator('button[aria-label="书架"]').first().click()
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

    await page.locator('button[aria-label="字体颜色"]').click()
    const readerOverlay = await overlayPage()
    await readerOverlay.locator('.swatch[title="#2f6f5e"]').nth(1).click()
    await page.waitForTimeout(300)
    await readerOverlay.locator('#close').click()
    await page.waitForTimeout(300)
    const readerColor = await page.evaluate(() => {
      const body = document.querySelector('.txt-body')
      return body ? getComputedStyle(body).color : ''
    })
    check('reader text color applies live', readerColor.replace(/\s/g, '') === 'rgb(47,111,94)', readerColor)
    await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'font-color-reader.png') })

    await page.locator('button[aria-label="返回书架"]').first().click()
    await page.waitForSelector('.shelf-header', { timeout: 10000 })
    await page
      .locator('.book-card')
      .filter({ has: page.locator('.book-format', { hasText: 'PDF' }) })
      .first()
      .locator('.book-card-main')
      .click()
    await page.waitForSelector('canvas.pdf-page', { timeout: 40000 })
    await page.waitForTimeout(800)
    await page.locator('button[aria-label="字体颜色"]').click()
    const pdfOverlay = await overlayPage()
    const pdfText = (await pdfOverlay.locator('#body').innerText()).replace(/\s+/g, ' ')
    check('pdf font panel explains fixed layout', /PDF 为固定版式/.test(pdfText), pdfText)
    const pdfControls = await pdfOverlay.locator('#body input[type=range], #body select.sel').count()
    check('pdf font panel hides font controls', pdfControls === 0, String(pdfControls))
    await pdfOverlay.screenshot({ path: path.join(root, 'tests', 'artifacts', 'font-color-pdf.png') })
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
    await new Promise((resolve) => server.close(resolve))
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('FONT COLOR TEST FAILED', error)
  process.exit(1)
})
