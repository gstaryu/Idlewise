const { _electron: electron } = require('@playwright/test')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-mini-${Date.now()}`), ELECTRON_DISABLE_SANDBOX: '1' },
  })
  let failures = 0
  const check = (name, ok, detail = '') => {
    console.log(ok ? 'PASS' : 'FAIL', name, detail)
    if (!ok) failures += 1
  }
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.locator('button[aria-label="迷你模式"]').click()
    await page.waitForTimeout(700)
    check('mini keeps normal rail', (await page.locator('.rail').count()) === 1)
    check('mini keeps normal toolbar', (await page.locator('.toolbar').count()) === 1)
    check('old mini bar removed', (await page.locator('.mini-bar').count()) === 0)
    for (const [width, height] of [[440, 360], [420, 300]]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows().find((item) => !item.getParentWindow()).setBounds({ x: 40, y: 40, width: size[0], height: size[1] })
      }, [width, height])
      await page.waitForTimeout(400)
      const rects = await page.locator('.toolbar button').evaluateAll((els) =>
        els
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => {
            const r = el.getBoundingClientRect()
            return { label: el.getAttribute('aria-label') || 'opacity', left: r.left, right: r.right, top: r.top, bottom: r.bottom }
          })
      )
      let overlap = false
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]
          const b = rects[j]
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlap = true
        }
      }
      check(`mini ${width}x${height} buttons do not overlap`, !overlap, JSON.stringify(rects.map((r) => r.label)))
      const close = rects.find((r) => r.label === '隐藏到托盘')
      const innerWidth = await page.evaluate(() => window.innerWidth)
      check(`mini ${width}x${height} buttons stay right`, Boolean(close) && close.right > innerWidth - 40, JSON.stringify({ innerWidth, right: close?.right }))
      check(`mini ${width}x${height} keeps window controls`, ['恢复窗口', '最小化', '最大化', '隐藏到托盘'].every((label) => rects.some((r) => r.label === label)))
      if (width === 440) {
        check('mini 440 keeps primary toolbar buttons', rects.length >= 8 && rects.some((r) => r.label === '自动隐藏'), String(rects.length))
      }
      await page.screenshot({ path: path.join(root, 'tests', 'artifacts', `mini-layout-${width}.png`) })
    }
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('MINI TEST FAILED', error)
  process.exit(1)
})
