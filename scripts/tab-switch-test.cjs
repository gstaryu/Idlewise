const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const path = require('path')
const { pathToFileURL } = require('url')

async function main() {
  const root = path.resolve(__dirname, '..')
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-tabswitch-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="浏览"]').first().click()
    await page.waitForTimeout(400)
    const address = page.locator('.browser-address input')
    await address.fill(pathToFileURL(path.join(root, 'tests', 'fixtures', 'page.html')).href)
    await address.press('Enter')
    await page.waitForTimeout(1400)
    await page.locator('button.tab-add').click()
    await page.waitForTimeout(400)
    await address.fill(pathToFileURL(path.join(root, 'tests', 'fixtures', 'page2.html')).href)
    await address.press('Enter')
    await page.waitForTimeout(1400)
    const tabs = page.locator('.tab-item .tab-title')
    await tabs.nth(0).click()
    await page.waitForTimeout(1200)
    const state = await page.evaluate(() => window.idlewise.invoke('debug:browser-state'))
    const active = state.find((item) => item.visible)
    const children = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
      return (win?.contentView.children || []).filter((child) => child.webContents).length
    })
    const ok = Boolean(active?.url.includes('page.html')) && children === 1
    console.log(ok ? 'PASS' : 'FAIL', 'switch back shows page one', JSON.stringify({ active, children }))
    if (!ok) process.exitCode = 1
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => !item.getParentWindow()).getBounds())
    const hwnd = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => !item.getParentWindow()).getNativeWindowHandle().readBigUInt64LE(0).toString())
    execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tests', 'artifacts', 'capture-window.ps1'), String(hwnd), String(bounds.x), String(bounds.y), String(bounds.width), String(bounds.height), path.join(root, 'tests', 'artifacts', 'tab-switch-proof.png')],
      { timeout: 30000 }
    )
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
}

main().catch((error) => {
  console.error('TAB SWITCH TEST FAILED', error.message)
  process.exit(1)
})
