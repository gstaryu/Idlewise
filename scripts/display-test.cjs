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
  const userData = path.join(root, '.idlewise-userdata-display')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  await app.firstWindow()
  await new Promise((r) => setTimeout(r, 1500))
  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor })))
  console.log('DISPLAYS', JSON.stringify(displays))
  check('display enumeration', displays.length >= 1, String(displays.length))

  if (displays.length >= 2) {
    const secondary = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0) ?? displays[0]
    const target = secondary.workArea
    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    await app.evaluate(({ BrowserWindow }, area) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setBounds({ x: area.x + 40, y: area.y + 40, width: 900, height: 700 })
    }, target)
    await new Promise((r) => setTimeout(r, 800))
    const moved = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    const onTarget = moved.x >= target.x && moved.y >= target.y && moved.x < target.x + target.width
    check('window moves to secondary display', onTarget, JSON.stringify(moved))
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ x: 504, y: 172, width: 1040, height: 760 })
    })
    await new Promise((r) => setTimeout(r, 500))
    const back = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    check(
      'window moves back to primary',
      back.x === 504 && back.y === 172 && back.width >= 700 && back.width <= 1600 && back.height >= 500 && back.height <= 1200,
      JSON.stringify(back)
    )
    console.log('BEFORE', JSON.stringify(before))
  } else {
    console.log('SKIP secondary display test: only one display')
  }

  console.log('FAILURES', failures)
  await app.close()
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('DISPLAY TEST FAILED', err)
  process.exit(1)
})
