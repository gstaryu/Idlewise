const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

async function main() {
  const root = path.resolve(__dirname, '..')
  const userData = path.join(root, '.idlewise-userdata-smoke')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  page.on('console', (msg) => console.log('[renderer]', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  await page.waitForTimeout(4000)
  console.log('TITLE:', await page.title())
  console.log('TEXT:', (await page.locator('body').innerText()).slice(0, 2000))
  fs.mkdirSync(path.join(root, 'tests', 'artifacts'), { recursive: true })
  await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'smoke.png') })
  const info = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return {
      count: BrowserWindow.getAllWindows().length,
      bounds: win?.getBounds(),
      visible: win?.isVisible(),
      opacity: win?.getOpacity(),
      alwaysOnTop: win?.isAlwaysOnTop(),
    }
  })
  console.log('WINDOW:', JSON.stringify(info))
  await app.close()
}

main().catch((err) => {
  console.error('SMOKE FAILED', err)
  process.exit(1)
})
