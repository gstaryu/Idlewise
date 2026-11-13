const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

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
  const userData = path.join(root, '.idlewise-userdata-hotkey')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])

  const pid = await app.evaluate(() => process.pid)
  const status = await invoke('bosskey:set', { enabled: true, toggleKey: 'Alt+Z', hideKey: 'Alt+X' })
  check('boss keys enabled', status.ok === true, JSON.stringify(status))
  const registered = await app.evaluate(({ globalShortcut }) => ({
    toggle: globalShortcut.isRegistered('Alt+Z'),
    hide: globalShortcut.isRegistered('Alt+X'),
  }))
  check('global shortcuts registered', registered.toggle && registered.hide, JSON.stringify(registered))
  const conflict = await invoke('bosskey:set', { enabled: true, toggleKey: 'Alt+Z', hideKey: 'Alt+Z' })
  check('duplicate shortcut rejected', conflict.ok === false, JSON.stringify(conflict))
  await invoke('bosskey:set', { enabled: true, toggleKey: 'Alt+Z', hideKey: 'Alt+X' })
  console.log('PID', pid)

  await invoke('debug:trigger-boss', { action: 'toggle' })
  await page.waitForTimeout(1000)
  const minimized = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())
  check('toggle action minimizes', minimized === true, String(minimized))

  await invoke('debug:trigger-boss', { action: 'toggle' })
  await page.waitForTimeout(1000)
  const restored = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return { minimized: win.isMinimized(), visible: win.isVisible() }
  })
  check('toggle action restores', restored.minimized === false && restored.visible === true, JSON.stringify(restored))

  await invoke('debug:trigger-boss', { action: 'hide' })
  await page.waitForTimeout(1000)
  const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
  check('hide action hides to background', hidden === false, String(hidden))
  await invoke('window:show')
  await page.waitForTimeout(500)
  const shown = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
  check('window can be restored', shown === true, String(shown))

  const tray = await invoke('debug:tray-state')
  check('tray exists', tray.exists === true && tray.destroyed === false, JSON.stringify(tray))

  console.log('FAILURES', failures)
  await app.close()
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('HOTKEY TEST FAILED', err)
  process.exit(1)
})
