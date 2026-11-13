const { _electron: electron } = require('@playwright/test')
const http = require('http')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')

async function memory(app) {
  const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, workingSetSize: m.memory?.workingSetSize || 0 })))
  return { metrics, totalKb: metrics.reduce((sum, m) => sum + m.workingSetSize, 0) }
}

async function main() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, 'tests', 'fixtures', 'page.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(8124, '127.0.0.1', resolve))

  const userData = path.join(root, '.idlewise-userdata-soak')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), [
    path.join(root, 'tests', 'fixtures', 'sample.txt'),
    path.join(root, 'tests', 'fixtures', 'sample.pdf'),
  ])
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 2, { timeout: 60000 })

  const openFormat = async (format, selector) => {
    const card = page.locator('.book-card').filter({ has: page.locator('.book-format', { hasText: format }) }).first()
    await card.locator('.book-card-main').click()
    await page.waitForSelector(selector, { timeout: 30000 })
    await page.waitForTimeout(300)
    await page.locator('button[aria-label="返回书架"]').first().click()
    await page.waitForSelector('.shelf-header', { timeout: 10000 })
  }

  const start = await memory(app)
  const startHeap = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0)
  const byType = (m) => Object.fromEntries([...new Set(m.metrics.map((x) => x.type))].map((t) => [t, m.metrics.filter((x) => x.type === t).reduce((sum, x) => sum + x.workingSetSize, 0)]))
  console.log('START', JSON.stringify({ totalKb: start.totalKb, heap: startHeap, processes: start.metrics.length, byType: byType(start) }))

  const cycles = Number(process.env.SOAK_CYCLES || 12)
  for (let i = 0; i < cycles; i++) {
    await openFormat('TXT', '.txt-body')
    await openFormat('PDF', 'canvas.pdf-page')
    await page.locator('button[aria-label="浏览"]').first().click()
    await page.waitForTimeout(300)
    await page.locator('.tab-add').click()
    await page.waitForTimeout(300)
    const address = page.locator('.browser-address input')
    await address.fill('http://127.0.0.1:8124/page.html')
    await address.press('Enter')
    await page.waitForTimeout(600)
    await page.locator('.tab-item.active .tab-close').click()
    await page.waitForTimeout(300)
    await page.locator('button[aria-label="书架"]').first().click()
    await page.waitForTimeout(300)
    if (i % 3 === 0) {
      const current = await memory(app)
      console.log('CYCLE', i, JSON.stringify({ totalKb: current.totalKb, processes: current.metrics.length }))
    }
  }

  await page.waitForTimeout(2500)
  const end = await memory(app)
  const endHeap = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0)
  const growthMb = (end.totalKb - start.totalKb) / 1024
  const heapGrowthMb = (endHeap - startHeap) / 1024 / 1024
  console.log('END', JSON.stringify({ totalKb: end.totalKb, heap: endHeap, growthMb, heapGrowthMb, processes: end.metrics.length, byType: byType(end) }))
  const pass = growthMb < 150 && heapGrowthMb < 80
  console.log(pass ? 'PASS memory soak' : 'FAIL memory soak', JSON.stringify({ growthMb, heapGrowthMb }))
  await page.screenshot({ path: path.join(out, '53-soak-end.png') })
  await app.close()
  server.close()
  if (!pass) process.exit(1)
}

main().catch((err) => {
  console.error('SOAK TEST FAILED', err)
  process.exit(1)
})
