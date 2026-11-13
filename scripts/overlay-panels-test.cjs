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
  await new Promise((resolve) => server.listen(8124, '127.0.0.1', resolve))
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-panels-${Date.now()}`),
      ELECTRON_DISABLE_SANDBOX: '1',
    },
  })
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
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })

    await page.locator('button[title="透明度"]').first().click()
    await page.waitForTimeout(250)
    check('opacity popover opens', (await page.locator('.popover-panel').count()) === 1)
    await page.locator('button[aria-label="自动隐藏"]').first().click()
    await page.waitForTimeout(250)
    const panels = page.locator('.popover-panel')
    check('clicking auto-hide switches popover in one click', (await panels.count()) === 1)
    const popoverText = (await panels.first().innerText()).replace(/\s+/g, ' ')
    check('auto-hide popover has no opacity controls', !popoverText.includes('整体不透明度'), popoverText)
    check('auto-hide popover shows both toggles', popoverText.includes('隐藏菜单栏') && popoverText.includes('隐藏主体'))
    await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'overlay-panels-popover.png') })
    await page.keyboard.press('Escape')

    await page.locator('button[aria-label="浏览"]').first().click()
    const address = page.getByPlaceholder('搜索或输入网址')
    await address.fill('http://127.0.0.1:8124/page.html')
    await address.press('Enter')
    await page.waitForTimeout(1500)

    await page.locator('button[title="透明度"]').first().click()
    const opacityOverlay = await overlayPage()
    let title = await opacityOverlay.locator('#title').innerText()
    let body = await opacityOverlay.locator('#body').innerText()
    check('opacity overlay title', title === '透明度', title)
    check('opacity overlay has no auto-hide switches', !body.includes('隐藏菜单栏') && !body.includes('隐藏主体'))
    await opacityOverlay.locator('#close').click()
    await page.waitForTimeout(400)

    await page.locator('button[aria-label="自动隐藏"]').first().click()
    const stealthOverlay = await overlayPage()
    title = await stealthOverlay.locator('#title').innerText()
    body = await stealthOverlay.locator('#body').innerText()
    check('stealth overlay title', title === '自动隐藏', title)
    check('stealth overlay has the two switches', body.includes('隐藏菜单栏') && body.includes('隐藏主体'))
    check('stealth overlay has no opacity sliders', !body.includes('整体不透明度') && !body.includes('背景透明度'))
    await stealthOverlay.screenshot({ path: path.join(root, 'tests', 'artifacts', 'overlay-stealth.png') })
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
    await new Promise((resolve) => server.close(resolve))
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('OVERLAY PANEL TEST FAILED', error)
  process.exit(1)
})
