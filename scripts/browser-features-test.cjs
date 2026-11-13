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
  await new Promise((resolve) => server.listen(8126, '127.0.0.1', resolve))
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-browser-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  let failures = 0
  const check = (name, ok, detail = '') => {
    console.log(ok ? 'PASS' : 'FAIL', name, detail)
    if (!ok) failures += 1
  }
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])
  const overlayPage = async () => {
    for (let i = 0; i < 40; i += 1) {
      const found = app.windows().find((win) => win.url().startsWith('data:text/html'))
      if (found) {
        await found.waitForSelector('#panel', { timeout: 5000 })
        return found
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('overlay not found')
  }
  let page
  try {
    page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="浏览"]').first().click()
    await page.waitForTimeout(500)
    await page.locator('button.tab-add').click()
    await page.waitForTimeout(400)
    const address = page.locator('.browser-address input')
    await address.fill('http://127.0.0.1:8126/page.html')
    await address.press('Enter')
    await page.waitForTimeout(1400)

    await page.locator('button[aria-label="网页设置"]').click()
    const overlay = await overlayPage()
    const body = (await overlay.locator('#body').innerText()).replace(/\s+/g, ' ')
    check('web settings removed scrollbar/transparent/font', !/隐藏滚动条|网页透明|字体颜色/.test(body), body)
    check('web settings keeps zoom/compat/mobile/video', ['网页缩放', '当前站点兼容模式', '手机模式访问', '视频速度'].every((text) => body.includes(text)), body)
    const compatInput = overlay.locator('label.sw', { hasText: '当前站点兼容模式' }).locator('input')
    await compatInput.click()
    await page.waitForTimeout(700)
    check('compat checkbox stays checked', await compatInput.isChecked(), String(await compatInput.isChecked()))
    const active = await invoke('browser:active')
    check('compat applied to active tab only', Boolean(active?.compat) && active.url.includes('page.html'), JSON.stringify(active))
    await overlay.locator('#close').click()
    await page.waitForTimeout(400)

    // history as a synthetic tab, current page preserved
    await page.locator('button[aria-label="历史记录"]').click()
    await page.waitForTimeout(1000)
    const special = page.locator('.tab-item', { hasText: '历史记录' })
    check('history opens as a tab', (await special.count()) === 1)
    const preserved = await invoke('browser:active')
    check('history keeps current page', Boolean(preserved?.url?.includes('page.html')), JSON.stringify(preserved))
    const firstTitle = page.locator('.list-panel .list-row .text-sm').first()
    const titleText = (await firstTitle.innerText()).trim()
    check('history title is not loading', titleText !== '加载中…' && titleText.length > 0, titleText)
    await special.locator('.tab-close').click()
    await page.waitForTimeout(500)
    check('closing history tab returns to page', (await page.locator('.tab-item', { hasText: '历史记录' }).count()) === 0)
    check('page still active after closing history tab', Boolean((await invoke('browser:active'))?.url?.includes('page.html')))

    const beforeHistoryLink = (await invoke('browser:tabs')).length
    await page.locator('button[aria-label="历史记录"]').click()
    await page.waitForTimeout(700)
    await page.locator('.list-panel .list-row button').first().click({ button: 'middle' })
    await page.waitForTimeout(800)
    const afterHistoryLink = await invoke('browser:tabs')
    check(
      'middle click history entry opens new tab',
      afterHistoryLink.length === beforeHistoryLink + 1,
      JSON.stringify(afterHistoryLink.map((tab) => tab.url))
    )

    // middle-click closes a tab
    const beforeClose = (await invoke('browser:tabs')).length
    await page.locator('button.tab-add').click()
    await page.waitForTimeout(500)
    const beforeMiddle = (await invoke('browser:tabs')).length
    await page.locator('.tab-item').last().click({ button: 'middle' })
    await page.waitForTimeout(500)
    const afterMiddle = (await invoke('browser:tabs')).length
    check('middle click closes tab', afterMiddle === beforeMiddle - 1, `${beforeMiddle} -> ${afterMiddle}`)

    // middle-click link inside the web page opens a new tab
    const beforeLinks = (await invoke('browser:tabs')).length
    await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find((item) => item.getURL().includes('page.html'))
      if (!wc) return
      await wc.executeJavaScript(`(() => {
        const link = document.querySelector('a[href="page2.html"]')
        if (link) link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
      })()`)
    })
    await page.waitForTimeout(1200)
    const tabsAfterLink = await invoke('browser:tabs')
    check('middle click page link opens new tab', tabsAfterLink.length === beforeLinks + 1 && tabsAfterLink.some((tab) => tab.url.includes('page2.html')), JSON.stringify(tabsAfterLink.map((tab) => tab.url)))

    await page.locator('.tab-item').first().click()
    await page.waitForTimeout(700)
    const siteCards = await page.locator('.site-card').count()
    check('empty tab still shows site cards', siteCards > 0, String(siteCards))
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
    await new Promise((resolve) => server.close(resolve))
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('BROWSER FEATURES TEST FAILED', error)
  process.exit(1)
})
