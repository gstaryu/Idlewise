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

async function launchWith(userData, settings) {
  fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(settings, null, 2))
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  const settingsOut = await page.evaluate(() => window.idlewise.invoke('settings:get'))
  await app.close()
  return settingsOut
}

async function main() {
  const oldDefault = await launchWith(path.join(root, '.idlewise-userdata-migrate-old'), {
    window: { renderMode: 'transparent', background: { type: 'color', color: '#f7f5f0', imagePath: null } },
  })
  check('old default color migrates to transparent', oldDefault.window.background.type === 'transparent', JSON.stringify(oldDefault.window.background))

  const explicitColor = await launchWith(path.join(root, '.idlewise-userdata-migrate-color'), {
    window: { renderMode: 'transparent', background: { type: 'color', color: '#112233', imagePath: null } },
  })
  check('explicit color is preserved', explicitColor.window.background.type === 'color' && explicitColor.window.background.color === '#112233', JSON.stringify(explicitColor.window.background))

  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('MIGRATION TEST FAILED', err)
  process.exit(1)
})
