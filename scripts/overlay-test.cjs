const { _electron: electron } = require('@playwright/test')
const path = require('path')
const { pathToFileURL } = require('url')

async function main() {
  const root = path.resolve(__dirname, '..')
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-overlay-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="浏览"]').first().click()
    const address = page.locator('.browser-address input')
    await address.fill(pathToFileURL(path.join(root, 'tests', 'fixtures', 'page.html')).href)
    await address.press('Enter')
    await page.waitForTimeout(1400)
    const before = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
      const view = (win?.contentView.children || []).find((child) => child.webContents)
      return view?.getBounds()
    })
    await page.locator('.stealth-pill').click()
    await page.waitForTimeout(900)
    let overlayPage = null
    for (const candidate of app.windows()) {
      const text = await candidate.locator('body').innerText({ timeout: 100 }).catch(() => '')
      if (text.includes('整体不透明度')) {
        overlayPage = candidate
        break
      }
    }
    console.log(overlayPage ? 'PASS' : 'FAIL', 'opacity overlay opens')
    if (!overlayPage) process.exitCode = 1
    await overlayPage.getByRole('button', { name: '50%', exact: true }).first().click()
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => window.idlewise.invoke('settings:get'))
    console.log(state.window.opacity === 50 ? 'PASS' : 'FAIL', 'overlay preset commits opacity', state.window.opacity)
    if (state.window.opacity !== 50) process.exitCode = 1
    const during = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
      const view = (win?.contentView.children || []).find((child) => child.webContents)
      return view?.getBounds()
    })
    console.log(JSON.stringify(before) === JSON.stringify(during) ? 'PASS' : 'FAIL', 'overlay does not move web view', JSON.stringify({ before, during }))
    if (JSON.stringify(before) !== JSON.stringify(during)) process.exitCode = 1
    await overlayPage.locator('#close').click()
    await page.waitForTimeout(500)
    console.log('PASS', 'overlay closed')
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
}

main().catch((error) => {
  console.error('OVERLAY TEST FAILED', error.message)
  process.exit(1)
})
