const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')
let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log('PASS', name, detail)
  else {
    failures += 1
    console.log('FAIL', name, detail)
  }
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-standard')
  fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify(
      {
        window: { renderMode: 'standard', opacity: 50, background: { type: 'color', color: '#112233' } },
      },
      null,
      2
    )
  )
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])

  const initial = await page.evaluate(() => {
    const rootEl = document.querySelector('.app-root')
    const style = getComputedStyle(rootEl)
    return { opacity: style.opacity, background: style.backgroundColor, classes: rootEl.className }
  })
  check('standard mode CSS opacity 50%', Math.abs(Number(initial.opacity) - 0.5) < 0.02, JSON.stringify(initial))
  check('standard mode opaque background', initial.background !== 'rgba(0, 0, 0, 0)' && initial.background !== 'transparent', initial.background)
  const settings = await invoke('settings:get')
  check('standard mode persisted', settings.window.renderMode === 'standard', settings.window.renderMode)
  const nativeOpacity = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getOpacity())
  check('native window stays fully opaque (CSS handles alpha)', nativeOpacity === 1, String(nativeOpacity))

  await invoke('window:set-opacity', { opacity: 25 })
  await page.waitForTimeout(600)
  const quarter = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.app-root')).opacity))
  check('standard mode opacity updates via CSS', Math.abs(quarter - 0.25) < 0.02, String(quarter))

  // 主界面即时切换透明/不透明，不重启
  await page.locator('button[aria-label="切换为透明模式"]').click()
  await page.waitForTimeout(500)
  const transparentClass = await page.evaluate(() => document.querySelector('.app-root').className)
  check('instant switch to transparent', transparentClass.includes('transparent-mode'), transparentClass)
  await page.locator('button[aria-label="切换为不透明模式"]').click()
  await page.waitForTimeout(500)
  const opaqueClass = await page.evaluate(() => document.querySelector('.app-root').className)
  check('instant switch back to opaque', !opaqueClass.includes('transparent-mode'), opaqueClass)
  const stillAlive = await page.evaluate(() => document.querySelectorAll('.app-root').length)
  check('no restart during render mode switch', stillAlive === 1, String(stillAlive))

  await page.screenshot({ path: path.join(out, '32-standard-mode.png') })
  console.log('SHOT 32-standard-mode')
  console.log('FAILURES', failures)
  await app.close()
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('STANDARD MODE TEST FAILED', err)
  process.exit(1)
})
