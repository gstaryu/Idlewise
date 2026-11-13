const { _electron: electron } = require('@playwright/test')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-fenbi-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="浏览"]').first().click()
    const address = page.locator('.browser-address input')
    await address.fill('https://www.fenbi.com')
    await address.press('Enter')
    await page.waitForTimeout(12000)
    await page.evaluate(() => window.idlewise.invoke('settings:update', { browser: { webTransparent: true } }))
    await page.waitForTimeout(1500)
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const view = (win.contentView.children || []).find((child) => child.webContents)
      const url = view?.webContents.getURL()
      const title = view?.webContents.getTitle()
      const styles = await view?.webContents.executeJavaScript(`(() => {
        const bg = (el) => el ? getComputedStyle(el).backgroundColor : null
        return { html: bg(document.documentElement), body: bg(document.body), app: bg(document.querySelector('#app, #root, .app')), bodyText: document.body.innerText.slice(0, 120) }
      })()`)
      return { url, title, styles }
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
}

main().catch((error) => {
  console.error('FENBI TEST FAILED', error.message)
  process.exit(1)
})
