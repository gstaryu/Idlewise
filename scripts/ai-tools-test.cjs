const { _electron: electron } = require('@playwright/test')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const executablePath = process.env.IDLEWISE_EXE
  const app = await electron.launch(
    executablePath
      ? {
          executablePath,
          args: [],
          env: {
            ...process.env,
            IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-ai-${Date.now()}`),
          },
        }
      : {
          args: ['.'],
          cwd: root,
          env: {
            ...process.env,
            IDLEWISE_USERDATA: path.join(root, `.idlewise-userdata-ai-${Date.now()}`),
            ELECTRON_DISABLE_SANDBOX: '1',
          },
        }
  )
  let failures = 0
  const check = (name, ok, detail = '') => {
    console.log(ok ? 'PASS' : 'FAIL', name, detail)
    if (!ok) failures += 1
  }
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app-root', { timeout: 30000 })
    await page.waitForTimeout(800)
    const brand = await page.locator('img.brand-dot').evaluate((el) => ({ width: el.naturalWidth, src: el.getAttribute('src') }))
    check('rail uses the new logo', brand.width > 0, JSON.stringify(brand))
    await page.locator('button[aria-label="AI 工具"]').click()
    await page.waitForTimeout(500)
    const cards = page.locator('.ai-card')
    check('AI rail entry opens AI view', (await page.locator('.ai-page').count()) === 1)
    check('AI view has six tools', (await cards.count()) === 6, String(await cards.count()))
    const names = await page.locator('.ai-card .font-medium').allInnerTexts()
    check('ChatGPT is present', names.includes('ChatGPT'), JSON.stringify(names))
    const logos = await page.locator('.ai-card img.ai-logo').evaluateAll((els) =>
      els.map((el) => ({ alt: el.getAttribute('alt'), width: el.naturalWidth, src: el.getAttribute('src') }))
    )
    check('every AI tool loads its logo', logos.length === 6 && logos.every((item) => item.width > 0), JSON.stringify(logos))
    await page.screenshot({ path: path.join(root, 'tests', 'artifacts', 'ai-tools.png') })
    await page.locator('.ai-card', { hasText: 'ChatGPT' }).click()
    await page
      .waitForFunction(
        async () => {
          const tabs = await window.idlewise.invoke('browser:tabs')
          return tabs.some((tab) => tab.url.includes('chatgpt.com'))
        },
        undefined,
        { timeout: 20000 }
      )
      .catch(() => {})
    const tabs = await page.evaluate(() => window.idlewise.invoke('browser:tabs'))
    const opened = tabs.some((tab) => tab.url.includes('chatgpt.com'))
    check('ChatGPT opens in browser view', opened, JSON.stringify(tabs))
  } finally {
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 4000))])
    try { app.process().kill() } catch {}
  }
  console.log('FAILURES', failures)
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error('AI TOOLS TEST FAILED', error)
  process.exit(1)
})
