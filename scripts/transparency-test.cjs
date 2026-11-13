const { _electron: electron } = require('@playwright/test')
const path = require('path')

const root = path.resolve(__dirname, '..')
let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log('PASS', name, detail)
  else {
    failures += 1
    console.log('FAIL', name, detail)
  }
}

async function main() {
  const userData = path.join(root, `.idlewise-userdata-transparency-${Date.now()}`)
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  try {
    console.log('STEP launched')
    const page = await app.firstWindow()
    page.on('pageerror', (error) => console.log('PAGEERROR', error.message))
    console.log('STEP window')
    await page.waitForSelector('.app-root', { timeout: 30000 })
    console.log('STEP ready')
    await page.waitForTimeout(700)
    console.log('STEP browser buttons', await page.locator('button[aria-label="浏览"]').count())
    await page.locator('button[aria-label="浏览"]').first().click()
    console.log('STEP browser')
    await page.waitForTimeout(400)
    const address = page.locator('.browser-address input')
    await address.fill(`file:///${path.join(root, 'tests', 'fixtures', 'transparent.html').replace(/\\/g, '/')}`)
    await address.press('Enter')
    console.log('STEP navigated')
    await page.waitForTimeout(2000)
    await page.evaluate(() => window.idlewise.invoke('settings:update', { browser: { webTransparent: true } }))
    console.log('STEP transparent set')
    await page.waitForTimeout(900)
    const styles = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const view = (win.contentView.children || []).find((child) => child.webContents)
      return view?.webContents.executeJavaScript(`(() => {
        const read = (selector) => {
          const el = selector === 'html' ? document.documentElement : document.querySelector(selector)
          return el ? getComputedStyle(el) : null
        }
        const html = read('html')
        const body = read('body')
        const app = read('#app')
        const card = read('.card')
        return {
          htmlBg: html?.backgroundColor,
          bodyBg: body?.backgroundColor,
          appBg: app?.backgroundColor,
          cardBg: card?.backgroundColor,
          cardColor: card?.color,
          hasStyle: Boolean(document.getElementById('idlewise-tab-prefs')),
          hasClass: document.body.classList.contains('idlewise-app-transparent'),
          imgVisibility: document.querySelector('#pic') ? getComputedStyle(document.querySelector('#pic')).visibility : null,
          imgOpacity: document.querySelector('#pic') ? getComputedStyle(document.querySelector('#pic')).opacity : null,
          text: document.querySelector('.card')?.textContent,
        }
      })()`)
    })
    const transparent = (value) => /rgba\(0, 0, 0, 0\)|transparent/.test(String(value))
    check('transparency style injected', Boolean(styles?.hasStyle) && Boolean(styles?.hasClass), JSON.stringify(styles))
    check('html/body/#app/.card backgrounds transparent', ['htmlBg', 'bodyBg', 'appBg', 'cardBg'].every((key) => transparent(styles?.[key])), JSON.stringify(styles))
    check('text stays visible', String(styles?.cardColor) !== '' && !transparent(styles?.cardColor) && String(styles?.text).length > 0, JSON.stringify(styles))
    check('images hidden in text-only mode', styles?.imgVisibility === 'hidden' && styles?.imgOpacity === '0', JSON.stringify(styles))
    check('window remains alive', (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1)
  } finally {
    console.log('STEP closing')
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
    console.log('STEP closed')
  }
  if (failures) {
    console.log('FAILURES', failures)
    process.exit(1)
  }
  console.log('FAILURES 0')
}

main().catch((error) => {
  console.error('TRANSPARENCY TEST FAILED', error)
  process.exit(1)
})
