const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

async function main() {
  const root = path.resolve(__dirname, '..')
  const userData = path.join(root, `.idlewise-userdata-sites-${Date.now()}`)
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'sites.json'), JSON.stringify([{ id: 'seed-bing', name: 'Bing', url: 'https://www.bing.com', compat: false }]))
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    const sites = await page.evaluate(() => window.idlewise.invoke('sites:list'))
    const ids = sites.map((site) => site.id)
    const ok = ['seed-bing', 'seed-fenbi', 'seed-douban', 'seed-bilibili', 'seed-jianshu', 'seed-juejin', 'seed-zhihu', 'seed-weread'].every((id) => ids.includes(id))
    console.log(ok ? 'PASS' : 'FAIL', 'existing sites receive v3 seeds', JSON.stringify(ids))
    if (!ok) process.exitCode = 1
    const marker = path.join(userData, 'sites.seeded-v3')
    console.log(fs.existsSync(marker) ? 'PASS' : 'FAIL', 'seed marker written')
    if (!fs.existsSync(marker)) process.exitCode = 1
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('SITES TEST FAILED', error.message)
  process.exit(1)
})
