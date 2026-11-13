const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SITES = [
  ['bing', 'https://www.bing.com'],
  ['zhihu', 'https://www.zhihu.com'],
  ['fenbi', 'https://www.fenbi.com'],
]
const TARGET = '#7a2f2f'

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
  const outDir = path.join(root, 'tests', 'artifacts', 'web-text-color')
  fs.mkdirSync(outDir, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-webcolor-${Date.now()}`),
      ELECTRON_DISABLE_SANDBOX: '1',
    },
  })
  let failures = 0
  const results = []
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.evaluate((color) =>
      window.idlewise.invoke('settings:update', { browser: { webTextColorEnabled: true, webTextColor: color } }),
      TARGET
    )
    await page.locator('button[aria-label="浏览"]').first().click()
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((item) => !item.getParentWindow()).setBounds({ x: 40, y: 40, width: 1000, height: 720 })
    })
    await page.waitForTimeout(700)
    const address = page.locator('.browser-address input')
    for (const [slug, url] of SITES) {
      try {
        await address.fill(url)
        await address.press('Enter')
        await page.waitForTimeout(6000)
        await page.evaluate(() => window.idlewise.invoke('browser:set-visible', { visible: true }))
        await page.waitForTimeout(1500)
        const colors = await app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow() && item.getTitle() === '偷闲有道')
          const view = (win?.contentView.children || []).find((child) => child.webContents)
          if (!view) return null
          return view.webContents.executeJavaScript(`(() => {
            const pick = (el) => (el ? getComputedStyle(el).color.replace(/\\s/g, '') : '')
            const sample = document.querySelector('p, h1, h2, article span, .content span')
            return { url: location.href, body: pick(document.body), sample: pick(sample), sampleTag: sample ? sample.tagName : '' }
          })()`)
        })
        const expected = 'rgb(122,47,47)'
        const ok = colors && colors.url.startsWith('http') && colors.body === expected && (!colors.sample || colors.sample === expected)
        if (!ok) failures += 1
        console.log(ok ? 'PASS' : 'FAIL', slug, JSON.stringify(colors))
        const bounds = await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow() && item.getTitle() === '偷闲有道')
          return win.getBounds()
        })
        const hwnd = await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
          return win.getNativeWindowHandle().readBigUInt64LE(0).toString()
        })
        screenshotWindow(bounds, hwnd, path.join(outDir, `${slug}.png`))
        results.push({ slug, url, colors, ok })
      } catch (error) {
        failures += 1
        console.log('FAIL', slug, error.message)
        results.push({ slug, url, error: error.message, ok: false })
      }
    }
  } finally {
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('WEB TEXT COLOR SITES TEST FAILED', error)
  process.exit(1)
})
