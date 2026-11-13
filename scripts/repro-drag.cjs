const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')

async function bounds(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return { bounds: win.getBounds(), normal: win.getNormalBounds(), maximized: win.isMaximized(), minimized: win.isMinimized() }
  })
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-drag')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)
  console.log('START', JSON.stringify(await bounds(app)))

  await page.mouse.move(600, 20)
  await page.mouse.down()
  await page.waitForTimeout(1500)
  console.log('HOLD', JSON.stringify(await bounds(app)))
  await page.mouse.up()
  await page.waitForTimeout(500)
  console.log('RELEASE', JSON.stringify(await bounds(app)))

  await page.mouse.move(600, 20)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(600 + i * 3, 20 + i * 2)
    await page.waitForTimeout(80)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  console.log('DRAG', JSON.stringify(await bounds(app)))

  await app.close()
}

main().catch((err) => {
  console.error('DRAG REPRO FAILED', err)
  process.exit(1)
})
