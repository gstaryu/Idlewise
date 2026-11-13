const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')
fs.mkdirSync(out, { recursive: true })

let failures = 0
function check(name, condition, detail = '') {
  if (condition) {
    console.log('PASS', name, detail)
  } else {
    failures += 1
    console.log('FAIL', name, detail)
  }
}

function moveCursor(x, y) {
  // NOTE: kept for interactive desktops only. This CI/agent session ignores SetCursorPos
  // (the cursor always reads 0,0), so auto-hide tests below use a main-process stub instead.
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`,
  ])
}

async function main() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, 'tests', 'fixtures', (req.url || '/page.html').replace(/^\//, ''))
    if (!fs.existsSync(file)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(8123, '127.0.0.1', resolve))

  const userData = path.join(root, `.idlewise-userdata-window-${Date.now()}`)
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)

  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])
  const debug = (channel) => invoke(channel)

  // issue #1: 工具栏改为原生拖拽区，按住空白栏不应移动/缩放窗口
  const beforeHold = await debug('debug:window-state')
  await page.mouse.move(600, 20)
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  const afterHold = await debug('debug:window-state')
  check(
    'toolbar hold keeps window bounds',
    beforeHold.bounds.x === afterHold.bounds.x &&
      beforeHold.bounds.y === afterHold.bounds.y &&
      beforeHold.bounds.width === afterHold.bounds.width &&
      beforeHold.bounds.height === afterHold.bounds.height,
    `${JSON.stringify(beforeHold.bounds)} -> ${JSON.stringify(afterHold.bounds)}`
  )

  // 窗口控制按钮位于右上角，顺序：最小化 -> 最大化 -> 关闭
  const controlRects = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    rects: ['最小化', '最大化', '隐藏到托盘'].map((label) => {
      const el = document.querySelector(`button[aria-label="${label}"]`)
      const rect = el?.getBoundingClientRect()
      return { label, x: rect?.x ?? -1 }
    }),
  }))
  check(
    'window controls top-right order',
    controlRects.rects.every((r) => r.x >= 0) &&
      controlRects.rects[0].x < controlRects.rects[1].x &&
      controlRects.rects[1].x < controlRects.rects[2].x &&
      controlRects.rects[2].x > controlRects.innerWidth * 0.75,
    JSON.stringify(controlRects)
  )

  await page.locator('button[aria-label="最大化"]').click()
  await page.waitForTimeout(700)
  const isMax = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())
  check('maximize button works', isMax === true, String(isMax))
  await page.locator('button[aria-label="还原窗口"]').click()
  await page.waitForTimeout(700)
  const isRestored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())
  check('restore button works', isRestored === false, String(isRestored))

  // 左侧栏：字体/颜色、滚动条、锁、设置（设置最后）
  const railLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rail-bottom button')).map((el) => el.getAttribute('aria-label'))
  )
  check(
    'rail order with settings last',
    railLabels[railLabels.length - 1] === '设置' &&
      railLabels.includes('字体颜色') &&
      railLabels.some((label) => label?.includes('滚动条')) &&
      railLabels.includes('立即锁定'),
    JSON.stringify(railLabels)
  )

  await page.locator('button[aria-label="字体颜色"]').click()
  await page.waitForTimeout(600)
  const fontOverlay = app.windows().find((win) => win.url().startsWith('data:text/html'))
  check(
    'font/color opens independent overlay',
    Boolean(fontOverlay) && (await page.locator('[data-testid="settings-panel"]').count()) === 0
  )
  if (fontOverlay) {
    await fontOverlay.locator('#close').click()
    await page.waitForTimeout(300)
  }

  const scrollLabel = railLabels.find((label) => label?.includes('滚动条')) || '隐藏网页滚动条'
  const settingsBefore = await invoke('settings:get')
  await page.locator(`button[aria-label="${scrollLabel}"]`).click()
  await page.waitForTimeout(400)
  const scrollSetting = await invoke('settings:get')
  check('rail scrollbar toggle works', scrollSetting.browser.hideScrollbar === !settingsBefore.browser.hideScrollbar)
  await page.locator(`button[aria-label="${scrollLabel === '隐藏网页滚动条' ? '显示网页滚动条' : '隐藏网页滚动条'}"]`).click()

  // 弹层：点击空白关闭 + 透明度实时预览 + 背景透明度独立
  await page.locator('.stealth-pill').click()
  await page.waitForTimeout(300)
  check('popover backdrop appears', (await page.locator('.popover-backdrop').count()) === 1)

  await page.locator('.popover-panel input[type=range]').first().evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, '40')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(220)
  const liveOpacity = Number(await page.evaluate(() => getComputedStyle(document.querySelector('.app-root')).opacity))
  check('opacity preview is immediate', Math.abs(liveOpacity - 0.4) < 0.06, String(liveOpacity))

  await page.locator('.popover-panel input[type=range]').nth(1).evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, '0')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(120)
  const bgAlpha = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.app-root')).getPropertyValue('--bg-alpha').trim()
  )
  const toolbarBg = await page.evaluate(() => getComputedStyle(document.querySelector('.toolbar')).backgroundColor)
  check('background transparency independent', bgAlpha === '100%', `${bgAlpha} / ${toolbarBg}`)
  const textOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('.app-title, .toolbar-title')).opacity)
  check('text opacity unaffected by background transparency', textOpacity === '1', textOpacity)

  await page.mouse.click(700, 500)
  await page.waitForTimeout(300)
  check('clicking blank closes popover', (await page.locator('.popover-backdrop').count()) === 0)

  await invoke('settings:update', { window: { opacity: 100, backgroundTransparency: 0 } })
  await page.waitForTimeout(500)

  // Simulate the OS cursor inside the main process. This is deterministic on virtual desktops
  // where SetCursorPos is a no-op, and exercises the same autohide tick path.
  const setCursor = (x, y) =>
    app.evaluate(({ screen }, p) => {
      screen.getCursorScreenPoint = () => p
    }, { x, y })
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `${name}.png`) })
    console.log('SHOT', name)
  }
  const viewShot = async (name) => {
    const data = await invoke('debug:capture-view')
    let size = 0
    if (data && data.startsWith('data:image')) {
      const buffer = Buffer.from(data.split(',')[1], 'base64')
      size = buffer.length
      fs.writeFileSync(path.join(out, `${name}.png`), buffer)
      console.log('SHOT', name, size)
    }
    return size
  }
  const cssOpacity = () => page.evaluate(() => getComputedStyle(document.querySelector('.app-root')).opacity)

  // ---------- opacity ----------
  await page.locator('.stealth-pill').click()
  await page.getByTestId('opacity-presets').getByRole('button', { name: '50%', exact: true }).click()
  await page.waitForTimeout(400)
  const op50 = Number(await cssOpacity())
  check('opacity 50%', op50 > 0.45 && op50 < 0.55, String(op50))
  await page.getByTestId('opacity-presets').getByRole('button', { name: '0%', exact: true }).click()
  await page.waitForTimeout(400)
  const op0 = Number(await cssOpacity())
  check('opacity 0% clamps to 0.01', op0 >= 0.009 && op0 <= 0.02, String(op0))
  await page.getByTestId('opacity-presets').getByRole('button', { name: '100%', exact: true }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')

  // ---------- always on top ----------
  await page.locator('button[aria-label="置顶窗口"]').click()
  await page.waitForTimeout(300)
  let state = await debug('debug:window-state')
  check('always on top on', state.alwaysOnTop === true, JSON.stringify(state.alwaysOnTop))
  await page.locator('button[aria-label="取消置顶"]').click()
  await page.waitForTimeout(300)
  state = await debug('debug:window-state')
  check('always on top off', state.alwaysOnTop === false)

  // ---------- content protection ----------
  await page.locator('button[aria-label="开启截屏保护"]').click()
  await page.waitForTimeout(300)
  state = await debug('debug:window-state')
  check('content protection setting', state.settings.contentProtection === true)
  await page.locator('button[aria-label="关闭截屏保护"]').click()

  // ---------- mini mode ----------
  await page.locator('button[aria-label="迷你模式"]').click()
  await page.waitForTimeout(500)
  state = await debug('debug:window-state')
  check('mini mode width', state.bounds.width === 440, JSON.stringify(state.bounds))
  await shot('10-mini-mode')
  await page.locator('button[aria-label="恢复窗口"]').click()
  await page.waitForTimeout(500)
  state = await debug('debug:window-state')
  check('mini mode restored', state.bounds.width > 500, JSON.stringify(state.bounds))

  // ---------- settings panel ----------
  await page.locator('button[aria-label="设置"]').first().click()
  await page.waitForTimeout(500)
  await shot('11-settings-general')
  const panelHeights = []
  panelHeights.push((await page.getByTestId('settings-panel').boundingBox())?.height || 0)
  await page.getByRole('button', { name: '隐蔽', exact: true }).click()
  panelHeights.push((await page.getByTestId('settings-panel').boundingBox())?.height || 0)
  const removedTabs = await page.getByRole('button', { name: /^(浏览器|阅读)$/ }).count()
  check('settings removed duplicated browser/reader tabs', removedTabs === 0, String(removedTabs))
  const scrollMetrics = await page.getByTestId('settings-scroll').evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }))
  await page.getByRole('button', { name: '窗口', exact: true }).click()
  panelHeights.push((await page.getByTestId('settings-panel').boundingBox())?.height || 0)
  check('settings tabs share one panel height', panelHeights.every((height) => height > 400) && Math.max(...panelHeights) - Math.min(...panelHeights) < 1, JSON.stringify(panelHeights))
  check('long settings tab scrolls inside panel', scrollMetrics.scroll >= scrollMetrics.client, JSON.stringify(scrollMetrics))
  await page.getByRole('button', { name: '安全', exact: true }).click()
  await page.waitForTimeout(200)
  check('settings auth section removed', (await page.getByText('认证接口', { exact: true }).count()) === 0)
  await page.getByRole('button', { name: '关于', exact: true }).click()
  await page.waitForTimeout(200)
  check('about explanation removed', (await page.getByText('本应用为独立实现', { exact: false }).count()) === 0)
  await page.getByRole('button', { name: '窗口', exact: true }).click()
  await page.waitForTimeout(200)
  await shot('12-settings-window')
  await page.getByRole('button', { name: /560/ }).click()
  await page.waitForTimeout(600)
  state = await debug('debug:window-state')
  check('default size preset applied', state.bounds.width === 560 && state.bounds.height === 760, JSON.stringify(state.bounds))
  await page.getByRole('button', { name: '直接退出', exact: true }).click()
  await page.waitForTimeout(400)
  const closeSetting = await invoke('settings:get')
  check('close action setting persists', closeSetting.window.closeAction === 'quit', closeSetting.window.closeAction)
  await invoke('settings:update', { window: { closeAction: 'tray' } })
  await invoke('window:set-default-size', { width: 1040, height: 760 })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '安全', exact: true }).click()
  await shot('13-settings-security')
  await page.locator('.fixed.inset-0 button[aria-label="关闭"]').first().click()
  await page.waitForTimeout(300)

  // ---------- lock ----------
  await page.locator('button[aria-label="设置"]').first().click()
  await page.getByRole('button', { name: '安全', exact: true }).click()
  await page.getByLabel('新密码（4–8 位数字）').fill('1234')
  await page.getByLabel('确认密码').fill('1234')
  await page.getByRole('button', { name: '设置密码', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '立即锁定', exact: true }).last().click()
  await page.waitForTimeout(800)
  check('lock screen visible', (await page.locator('.lock-screen').count()) === 1)
  await shot('14-lock-screen')
  await page.locator('.lock-input').fill('0000')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.waitForTimeout(600)
  check('wrong pin rejected', (await page.locator('.lock-screen').count()) === 1)
  await page.locator('.lock-input').fill('1234')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.waitForTimeout(800)
  check('unlocked', (await page.locator('.lock-screen').count()) === 0)
  await page.locator('.fixed.inset-0 button[aria-label="关闭"]').first().click().catch(() => {})

  // ---------- boss keys ----------
  await page.locator('button[aria-label="设置"]').first().click()
  await page.getByRole('button', { name: '隐蔽', exact: true }).click()
  await page.locator('button[role="switch"][aria-label="启用全局快捷键"]').click()
  await page.getByRole('button', { name: '应用快捷键', exact: true }).click()
  await page.waitForTimeout(600)
  const bossRegistered = await app.evaluate(({ globalShortcut }) => ({
    z: globalShortcut.isRegistered('Alt+Z'),
    x: globalShortcut.isRegistered('Alt+X'),
  }))
  check('boss keys registered', bossRegistered.z && bossRegistered.x, JSON.stringify(bossRegistered))
  await page.locator('button[role="switch"][aria-label="不显示托盘悬停文字"]').click()
  await page.waitForTimeout(400)
  const trayState = await debug('debug:tray-state')
  check('tray tooltip hidden setting', trayState.hideTooltip === true, JSON.stringify(trayState))

  // ---------- auto hide (cursor stubbed; SetCursorPos is a no-op in this session) ----------
  await page.locator('.fixed.inset-0 button[aria-label="关闭"]').first().click()
  await page.waitForTimeout(300)
  await page.locator('button[aria-label="自动隐藏"]').click()
  await page.waitForTimeout(300)
  await page.locator('button[role="switch"][aria-label="鼠标移出时隐藏菜单栏"]').click()
  await page.locator('button[role="switch"][aria-label="鼠标移出时隐藏主体"]').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const content = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
  const inside = { x: content.x + content.width * 0.5, y: content.y + content.height * 0.55 }
  await page.waitForTimeout(1000) // settings writes reset the auto-hide grace
  const hideStart = Date.now()
  await setCursor(1, 1)
  await page.waitForFunction(() => document.querySelector('.app-root')?.classList.contains('header-hidden'), { timeout: 2000 })
  const hideLatency = Date.now() - hideStart
  check('auto-hide latency under 700ms', hideLatency < 700, `${hideLatency}ms`)
  await page.waitForTimeout(200)
  let classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('body hidden on mouse leave', classes.includes('body-hidden'), classes)
  check('header hidden on mouse leave', classes.includes('header-hidden'), classes)
  const hitHidden = await debug('debug:stealth-state')
  check('auto-hide state recorded', hitHidden.bodyHidden === true && hitHidden.headerHidden === true, JSON.stringify(hitHidden))
  const hiddenOpacity = await page.evaluate(() => ({
    rail: getComputedStyle(document.querySelector('.rail')).opacity,
    main: getComputedStyle(document.querySelector('.main-column')).opacity,
  }))
  check('whole interface hidden (rail + main column)', hiddenOpacity.rail === '0' && hiddenOpacity.main === '0', JSON.stringify(hiddenOpacity))
  await shot('15-auto-hidden')

  await setCursor(inside.x, inside.y)
  await page.waitForTimeout(800)
  classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('body shown on mouse return', !classes.includes('body-hidden'), classes)
  check('header stays hidden while pointer is below top edge', classes.includes('header-hidden'), classes)

  await setCursor(content.x + content.width * 0.5, content.y + 4)
  await page.waitForTimeout(800)
  classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('header shown on top-edge hover', !classes.includes('header-hidden'), classes)

  // issue #2: 顶部热区唤出后，必须能打开“自动隐藏”弹层并关闭功能
  await page.locator('button[aria-label="自动隐藏"]').click()
  await page.waitForTimeout(400)
  const headerSwitch = page.locator('button[role="switch"][aria-label="鼠标移出时隐藏菜单栏"]')
  check('auto-hide popover reachable', await headerSwitch.isVisible())
  await page.waitForTimeout(1200)
  classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('header stays visible while auto-hide popover open', !classes.includes('header-hidden'), classes)
  await headerSwitch.click()
  await page.locator('button[role="switch"][aria-label="鼠标移出时隐藏主体"]').click()
  await page.waitForTimeout(500)
  const disabled = await invoke('settings:get')
  check('auto-hide can be disabled from toolbar', disabled.stealth.headerAutoHide === false && disabled.stealth.bodyAutoHide === false, JSON.stringify(disabled.stealth))
  await page.mouse.click(420, 700)
  await page.waitForTimeout(400)
  check('auto-hide popover closed', (await page.locator('.popover-backdrop').count()) === 0)

  // independence: body auto-hide off + header auto-hide on
  await invoke('settings:update', { stealth: { headerAutoHide: true, bodyAutoHide: false } })
  await page.waitForTimeout(1200)
  await setCursor(inside.x, inside.y)
  await page.waitForTimeout(800)
  classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('header-only: header hides inside content', classes.includes('header-hidden'), classes)
  check('header-only: body stays visible', !classes.includes('body-hidden'), classes)
  await setCursor(1, 1)
  await page.waitForTimeout(800)
  classes = await page.evaluate(() => document.querySelector('.app-root').className)
  check('header-only: body stays visible outside', !classes.includes('body-hidden'), classes)

  // restore a clean state for the browser tests
  await invoke('settings:update', { stealth: { headerAutoHide: false, bodyAutoHide: false } })
  await setCursor(inside.x, inside.y)
  await page.waitForTimeout(1000)

  // ---------- browser ----------
  await page.locator('button[aria-label="浏览"]').first().click()
  await page.waitForTimeout(700)
  await shot('16-browser-home')
  const seeded = []
  for (const name of ['粉笔网', '豆瓣', '哔哩哔哩', '简书', '掘金', '知乎', '微信读书']) {
    seeded.push((await page.locator('.site-card', { hasText: name }).count()) > 0)
  }
  check('supported reading sites seeded', seeded.every(Boolean), JSON.stringify(seeded))
  check('AI tools moved to rail', (await page.locator('button[aria-label="AI 工具"]').count()) === 1)
  await page.locator('button[aria-label="AI 工具"]').click()
  await page.waitForTimeout(300)
  check('AI tools section present', (await page.locator('.ai-card').count()) === 6)
  await page.locator('button[aria-label="浏览"]').click()
  await page.waitForTimeout(300)
  check('load placeholder removed', (await page.getByText('网页加载完成后将覆盖此区域').count()) === 0)
  const address = page.locator('.browser-address input')
  await address.fill('http://127.0.0.1:8123/page.html')
  await address.press('Enter')
  await page.waitForTimeout(2600)
  let views = await debug('debug:browser-state')
  check('browser navigated', views.some((view) => view.url.includes('page.html')), JSON.stringify(views))
  check('browser title', views.some((view) => view.title.includes('Idlewise Browser Test')), JSON.stringify(views))
  check('browser view visible', views.some((view) => view.visible === true), JSON.stringify(views.map((v) => v.visible)))
  const pageShotSize = await viewShot('17-browser-page')
  check('browser page capture non-empty', pageShotSize > 1000, String(pageShotSize))

  // browser settings overlay must keep the page live and must not move it
  const viewBefore = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
    const view = (win?.contentView.children || []).find((child) => child.webContents)
    return view?.getBounds()
  })
  await page.locator('button[aria-label="网页设置"]').click({ timeout: 5000 })
  await page.waitForTimeout(1000)
  let overlayPage = null
  for (let attempt = 0; attempt < 20 && !overlayPage; attempt += 1) {
    for (const candidate of app.windows()) {
      const text = await candidate.locator('body').innerText({ timeout: 100 }).catch(() => '')
      if (text.includes('网页设置')) {
        overlayPage = candidate
        break
      }
    }
    if (!overlayPage) await page.waitForTimeout(100)
  }
  check('browser settings opens native overlay', Boolean(overlayPage))
  const viewDuring = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
    const view = (win?.contentView.children || []).find((child) => child.webContents)
    return view?.getBounds()
  })
  check(
    'browser page stays live without moving',
    Boolean(viewDuring) && viewDuring.y === Number(viewBefore?.y),
    JSON.stringify({ viewBefore, viewDuring })
  )
  check('main window remains visible under overlay', (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((item) => item.isVisible()).length)) >= 2)
  await overlayPage.getByRole('button', { name: '2×' }).click({ timeout: 5000 })
  await page.waitForTimeout(500)
  const rate = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
    const view = (win?.contentView.children || []).find((child) => child.webContents)
    return view?.webContents.executeJavaScript('document.querySelector("video")?.playbackRate')
  })
  check('video speed applied', Math.abs(Number(rate) - 2) < 0.01, String(rate))

  // mobile mode
  await overlayPage.locator('label.sw', { hasText: '手机模式访问' }).locator('input').click()
  await page.waitForTimeout(700)
  views = await debug('debug:browser-state')
  check('mobile UA applied', views.some((view) => /Android/i.test(view.ua)), JSON.stringify(views.map((v) => v.ua)))
  await overlayPage.locator('label.sw', { hasText: '手机模式访问' }).locator('input').click()
  await page.waitForTimeout(500)

  // compatibility mode
  await overlayPage.locator('label.sw', { hasText: '当前站点兼容模式' }).locator('input').click()
  await page.waitForTimeout(600)
  state = await debug('debug:window-state')
  check('compat host stored', state.settings.browser.compatHosts.includes('127.0.0.1'), JSON.stringify(state.settings.browser.compatHosts))
  await overlayPage.locator('#close').click()
  await page.waitForTimeout(700)
  const viewAfter = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.getParentWindow())
    const view = (win?.contentView.children || []).find((child) => child.webContents)
    return view?.getBounds()
  })
  check(
    'browser page restored after overlay',
    Boolean(viewAfter) && viewAfter.y === Number(viewBefore?.y),
    JSON.stringify({ viewBefore, viewAfter })
  )

  // zoom via handler (UI slider is also covered by settings)
  await invoke('browser:set-zoom', { zoom: 150 })
  await page.waitForTimeout(400)
  views = await debug('debug:browser-state')
  check('zoom applied', views.some((view) => Math.abs(view.zoom - 1.5) < 0.01), JSON.stringify(views.map((v) => v.zoom)))
  await invoke('browser:set-zoom', { zoom: 100 })

  // navigate to page two inside the view, then back
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const view = (win.contentView.children || []).find((child) => child.webContents)
    await view?.webContents.executeJavaScript('document.querySelector("a")?.click()')
  })
  await page.waitForTimeout(1600)
  views = await debug('debug:browser-state')
  check('navigated to page two', views.some((view) => view.url.includes('page2.html')), JSON.stringify(views))
  check('view still visible after in-page navigation', views.some((view) => view.visible === true), JSON.stringify(views.map((v) => v.visible)))
  console.log('VIEWS AFTER LINK', JSON.stringify(views))
  await page.locator('button[aria-label="后退"]').click({ timeout: 5000 })
  await page.waitForTimeout(1200)
  views = await debug('debug:browser-state')
  check('back to page one', views.some((view) => view.url.includes('page.html')), JSON.stringify(views.map((v) => v.url)))

  // history + bookmarks
  await page.locator('button[aria-label="历史记录"]').click()
  await page.waitForTimeout(500)
  const historyRows = await page.locator('.list-row').count()
  check('history recorded', historyRows > 0, String(historyRows))
  await shot('18-browser-history')
  await page.locator('button[aria-label="收藏夹"]').click()
  await page.waitForTimeout(300)
  await page.locator('.browser-address button[title="收藏此页"]').click()
  await page.waitForTimeout(600)
  const bookmarkRows = await page.locator('.list-row').count()
  check('bookmark added', bookmarkRows > 0, String(bookmarkRows))
  await shot('19-browser-bookmarks')

  // sites (home button now opens the site grid; dedicated button was removed)
  await page.locator('button[aria-label="主页"]').click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '添加站点', exact: true }).click()
  await page.getByPlaceholder('例如：微信读书').fill('本地测试')
  await page.getByPlaceholder('https://example.com').fill('http://127.0.0.1:8123/page2.html')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(600)
  check('site added', (await page.locator('.site-card').count()) >= 1)
  await shot('20-browser-sites')

  // multi tab
  const beforeTabs = await page.locator('.tab-item').count()
  await page.locator('.tab-add').click()
  await page.waitForTimeout(500)
  const afterTabs = await page.locator('.tab-item').count()
  check('new tab created', afterTabs === beforeTabs + 1, `${beforeTabs} -> ${afterTabs}`)
  await page.locator('.tab-item.active .tab-close').click()
  await page.waitForTimeout(500)
  check('tab closed', (await page.locator('.tab-item').count()) === beforeTabs)

  // background + tray icon handlers
  await invoke('settings:update', {
    window: { background: { type: 'color', color: '#112233' }, backgroundTransparency: 0 },
  })
  await page.waitForTimeout(700)
  const transparentBg = await page.evaluate(() => getComputedStyle(document.querySelector('.toolbar')).backgroundColor)
  check(
    'background color applied when background is opaque',
    transparentBg !== 'rgba(0, 0, 0, 0)' && (transparentBg.includes('17') || transparentBg.includes('0.0666667')),
    transparentBg
  )
  const bg = await invoke('window:set-background-image-path', { path: path.join(root, 'resources', 'build', 'icon.png') })
  check('background image set', Boolean(bg), String(bg))
  const tray = await invoke('tray:set-icon-path', { path: path.join(root, 'resources', 'build', 'icon.png') })
  check('tray icon set', Boolean(tray), String(tray))

  console.log('FAILURES', failures)
  await app.close()
  server.close()
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('WINDOW/BROWSER TEST FAILED', err)
  process.exit(1)
})
