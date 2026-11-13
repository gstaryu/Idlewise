const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')

async function main() {
  const userData = path.join(root, '.idlewise-userdata-foliate')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  page.on('pageerror', (err) => console.log('PAGEERROR', err.stack || err.message))
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), [
    path.join(root, 'tests', 'fixtures', 'alice.mobi'),
    path.join(root, 'tests', 'fixtures', 'sample.pdf'),
  ])
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 2, { timeout: 60000 })

  const open = async (format) => {
    const card = page.locator('.book-card').filter({ has: page.locator('.book-format', { hasText: format }) }).first()
    await card.locator('.book-card-main').click()
    await page.waitForTimeout(3000)
    console.log('OPENED', format)
    await page.locator('button[aria-label="返回书架"]').first().click()
    await page.waitForTimeout(700)
  }

  await open('MOBI')
  await open('PDF')
  await open('MOBI')
  await open('AZW3').catch(() => {})
  await app.close()
}

main().catch((err) => {
  console.error('REPRO FAILED', err)
  process.exit(1)
})
