const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SITES = [
  ['bing', 'https://www.bing.com'],
  ['zhihu', 'https://www.zhihu.com'],
  ['fenbi', 'https://www.fenbi.com'],
  ['douban', 'https://www.douban.com'],
  ['bilibili', 'https://www.bilibili.com'],
  ['jianshu', 'https://www.jianshu.com'],
  ['juejin', 'https://juejin.cn'],
  ['weread', 'https://weread.qq.com'],
]

function screenshotWindow(bounds, hwnd, file) {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, '..', 'tests', 'artifacts', 'capture-window.ps1'),
      String(hwnd),
      String(bounds.x),
      String(bounds.y),
      String(bounds.width),
      String(bounds.height),
      file,
    ],
    { timeout: 30000 }
  )
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const outDir = path.join(root, 'tests', 'artifacts', 'transparent-sites')
  fs.mkdirSync(outDir, { recursive: true })
  let failures = 0
  let proof = null
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-siteshot-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const results = []
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="浏览"]').first().click()
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((item) => !item.getParentWindow()).setBounds({ x: 40, y: 40, width: 1000, height: 720 })
    })
    await page.waitForTimeout(700)
    const address = page.locator('.browser-address input')
    for (const [slug, url] of SITES) {
      let loaded = false
      let bg = null
      let alphaRatio = null
      try {
        await address.fill(url)
        await address.press('Enter')
        await page.waitForTimeout(5000)
        await page.evaluate(() => window.idlewise.invoke('browser:set-visible', { visible: true }))
        await page.waitForTimeout(1500)
        const state = await page.evaluate(() => window.idlewise.invoke('debug:browser-state'))
        const active = state.find((item) => item.visible) || state[0]
        loaded = Boolean(active?.url && !active.url.startsWith('file:'))
        const details = await app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow() && item.getTitle() === '偷闲有道') || BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
          const view = (win?.contentView.children || []).find((child) => child.webContents)
          if (!view) return null
          const url = view.webContents.getURL()
          const bg = await view.webContents.executeJavaScript(
            '({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor})'
          )
          const img = await view.webContents.capturePage()
          const bmp = img.toBitmap()
          let zero = 0
          for (let i = 3; i < bmp.length; i += 4) if (bmp[i] === 0) zero += 1
          return { url, bg, alphaRatio: zero / (bmp.length / 4), viewBounds: view.getBounds() }
        })
        bg = details?.bg || null
        alphaRatio = details?.alphaRatio ?? null
        if (!loaded || !details?.url?.startsWith('http')) failures += 1
        const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => !item.getParentWindow() && item.getTitle() === '偷闲有道').getBounds())
        const hwnd = await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
          return win.getNativeWindowHandle().readBigUInt64LE(0).toString()
        })
        screenshotWindow(bounds, hwnd, path.join(outDir, `${slug}.png`))
        const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(String(bg?.html)) && /rgba\(0, 0, 0, 0\)|transparent/.test(String(bg?.body))
        console.log(transparent ? 'PASS' : 'FAIL', slug, JSON.stringify({ loaded, bg, alphaRatio }))
        if (!transparent) failures += 1
      } catch (error) {
        failures += 1
        console.log('FAIL', slug, error.message)
      }
      results.push({ slug, url, loaded, bg, alphaRatio })
    }
  } finally {
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
    if (proof) {
      await app
        .evaluate(({ BrowserWindow }, value) => {
          const backdrop = BrowserWindow.fromId(value.backdropId)
          if (backdrop && !backdrop.isDestroyed()) backdrop.destroy()
          const main = BrowserWindow.fromId(value.mainId)
          if (main && !main.isDestroyed()) main.setAlwaysOnTop(value.wasTop)
        }, proof)
        .catch(() => {})
    }
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try {
      app.process().kill()
    } catch {}
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('SITES TEST FAILED', error)
  process.exit(1)
})
