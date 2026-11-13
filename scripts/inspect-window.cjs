const { _electron: electron } = require('@playwright/test')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, '.idlewise-userdata-inspect'), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 1500))
  const info = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return {
      bounds: win.getBounds(),
      visible: win.isVisible(),
      minimized: win.isMinimized(),
      focused: win.isFocused(),
      alwaysOnTop: win.isAlwaysOnTop(),
      opacity: win.getOpacity(),
      title: win.getTitle(),
      handle: win.getNativeWindowHandle().toString('hex'),
    }
  })
  console.log('WINDOW_INFO', JSON.stringify(info))
  await page.screenshot({ path: path.join(root, 'tests', 'artifacts', '40-inspect-renderer.png') })
  await new Promise((r) => setTimeout(r, 25000))
  await app.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
