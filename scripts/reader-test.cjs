const { _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')
const fixtures = [
  path.join(root, 'tests', 'fixtures', 'sample.epub'),
  path.join(root, 'tests', 'fixtures', 'sample.pdf'),
  path.join(root, 'tests', 'fixtures', 'sample.txt'),
  path.join(root, 'tests', 'fixtures', 'alice.mobi'),
  path.join(root, 'tests', 'fixtures', 'alice.azw3'),
]
fs.mkdirSync(out, { recursive: true })

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log('PASS', name, detail)
  else {
    failures += 1
    console.log('FAIL', name, detail)
  }
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-reader')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack || err.message))
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1000)
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `${name}.png`) })
    console.log('SHOT', name)
  }
  const openFormat = async (format) => {
    const card = page.locator('.book-card').filter({ has: page.locator('.book-format', { hasText: format }) }).first()
    await card.locator('.book-card-main').click()
    await page.waitForSelector('.reading-header', { timeout: 20000 })
    await page.waitForTimeout(1200)
    return card
  }
  const backToShelf = async () => {
    await page.locator('button[aria-label="返回书架"]').first().click()
    await page.waitForSelector('.shelf-header', { timeout: 10000 })
    await page.waitForTimeout(400)
  }

  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), fixtures)
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 5, { timeout: 90000 })

  // ---------- categories ----------
  await page.getByRole('button', { name: '管理分类' }).click()
  await page.getByPlaceholder('新分类名称').fill('测试分类')
  await page.getByRole('button', { name: '新建' }).click()
  await page.waitForTimeout(500)
  await page.locator('.fixed.inset-0 button[aria-label="关闭"]').first().click()
  await page.waitForTimeout(300)
  const txtCard = page.locator('.book-card').filter({ has: page.locator('.book-format', { hasText: 'TXT' }) }).first()
  await txtCard.hover()
  await txtCard.locator('.book-menu-btn').click()
  await page.locator('.menu-item', { hasText: '测试分类' }).click()
  await page.waitForTimeout(500)
  await page.locator('.category-bar .category-chip', { hasText: '测试分类' }).click()
  await page.waitForTimeout(500)
  check('category filter shows assigned book', (await page.locator('.book-card').count()) === 1, String(await page.locator('.book-card').count()))
  await shot('21-category-filter')
  await page.locator('.category-bar .category-chip', { hasText: '未分类' }).click()
  await page.waitForTimeout(400)
  check('uncategorized filter', (await page.locator('.book-card').count()) === 4, String(await page.locator('.book-card').count()))
  await page.locator('.category-bar .category-chip').first().click()
  await page.waitForTimeout(300)

  // ---------- TXT search / toc / auto ----------
  await openFormat('TXT')
  await page.waitForSelector('.txt-body')
  const beforeKey = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(800)
  const afterKey = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('page flip shortcut next', afterKey > beforeKey, `${beforeKey} -> ${afterKey}`)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(800)
  const backKey = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('page flip shortcut prev', backKey < afterKey, `${afterKey} -> ${backKey}`)
  await page.locator('button[aria-label="目录"]').click()
  await page.waitForTimeout(400)
  check('txt toc has items', (await page.locator('.toc-item').count()) > 0)
  await shot('22-txt-toc')
  await page.locator('.toc-item').nth(1).click()
  await page.waitForTimeout(500)

  await page.locator('button[aria-label="全文搜索"]').click()
  await page.locator('.drawer input').fill('林舟')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.waitForTimeout(800)
  const txtResults = await page.locator('.search-result').count()
  check('txt search results', txtResults > 0, String(txtResults))
  await shot('23-txt-search')
  await page.locator('.search-result').first().click()
  await page.waitForTimeout(500)

  // TXT 翻页/滚动排版模式
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await invoke('settings:update', { reader: { flow: 'paginated' } })
  await page.waitForTimeout(600)
  const txtPaginatedClass = await page.locator('.txt-scroll').getAttribute('class')
  check('txt paginated mode', Boolean(txtPaginatedClass?.includes('txt-paginated')), txtPaginatedClass || '')
  const txtFlowBefore = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(800)
  const txtFlowAfter = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('txt paginated next', txtFlowAfter > txtFlowBefore, `${txtFlowBefore} -> ${txtFlowAfter}`)
  await invoke('settings:update', { reader: { flow: 'scrolled' } })
  await page.waitForTimeout(500)
  const txtScrolledClass = await page.locator('.txt-scroll').getAttribute('class')
  check('txt scrolled mode', !txtScrolledClass?.includes('txt-paginated'), txtScrolledClass || '')

  // reader prefs: font chip + colors via settings
  await page.locator('button[aria-label="阅读设置"]').click()
  await page.getByRole('button', { name: '宋体' }).click()
  await page.waitForTimeout(400)
  const defaultSettings = await invoke('settings:get')
  check('background default 100% transparent', defaultSettings.window.backgroundTransparency === 100, String(defaultSettings.window.backgroundTransparency))
  await invoke('settings:update', {
    reader: { fontSize: 22, textColor: '#7a2f2f', backgroundColor: '#fff6e5' },
    window: { backgroundTransparency: 0 },
  })
  await page.waitForTimeout(600)
  const txtStyle = await page.locator('.txt-scroll').evaluate((el) => {
    const style = getComputedStyle(el)
    return { color: style.color, background: style.backgroundColor, font: getComputedStyle(el.querySelector('.txt-body')).fontSize }
  })
  check('txt font applied', txtStyle.font === '22px', JSON.stringify(txtStyle))
  check('txt text color applied', txtStyle.color.includes('122, 47, 47'), JSON.stringify(txtStyle))
  await shot('24-txt-styled')
  await page.mouse.click(420, 700)
  await page.waitForTimeout(300)
  check('reader settings popover closed', (await page.locator('.popover-backdrop').count()) === 0)

  // auto scroll
  await invoke('settings:update', { reader: { autoScrollSpeed: 10 } })
  await page.locator('.txt-scroll').evaluate((el) => (el.scrollTop = 0))
  const beforeScroll = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  await page.getByRole('button', { name: '自动滚动', exact: true }).click()
  await page.waitForTimeout(1400)
  await page.getByRole('button', { name: '自动滚动', exact: true }).click()
  const afterScroll = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('auto scroll moves', afterScroll > beforeScroll, `${beforeScroll} -> ${afterScroll}`)

  // auto page
  await invoke('settings:update', { reader: { autoPageSeconds: 3 } })
  await page.locator('.txt-scroll').evaluate((el) => (el.scrollTop = 0))
  const pageBefore = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  await page.getByRole('button', { name: '自动翻页', exact: true }).click()
  await page.waitForTimeout(3800)
  await page.getByRole('button', { name: '自动翻页', exact: true }).click()
  const afterPage = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('auto page moves', afterPage > pageBefore + 50, `${pageBefore} -> ${afterPage}`)

  // progress persistence
  await page.locator('.txt-scroll').evaluate((el) => (el.scrollTop = 600))
  await page.waitForTimeout(1600)
  await backToShelf()
  const library = JSON.parse(fs.readFileSync(path.join(userData, 'library.json'), 'utf8'))
  const txtBook = library.books.find((b) => b.format === 'txt')
  check('progress saved', txtBook && txtBook.progress > 0.01, JSON.stringify(txtBook && { progress: txtBook.progress, location: txtBook.location }))
  await openFormat('TXT')
  await page.waitForTimeout(1200)
  const restored = await page.locator('.txt-scroll').evaluate((el) => el.scrollTop)
  check('progress restored', restored > 200, String(restored))
  await backToShelf()

  // ---------- EPUB search / toc ----------
  await openFormat('EPUB')
  await page.waitForSelector('foliate-view', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.locator('button[aria-label="目录"]').click()
  await page.waitForTimeout(500)
  check('epub toc has items', (await page.locator('.toc-item').count()) > 0)
  await shot('25-epub-toc')
  await page.locator('.toc-item').first().click()
  await page.waitForTimeout(600)
  await page.locator('button[aria-label="全文搜索"]').click()
  await page.locator('.drawer input').fill('OpenRead')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.waitForTimeout(2500)
  const epubResults = await page.locator('.search-result').count()
  check('epub search results', epubResults > 0, String(epubResults))
  await shot('26-epub-search')
  await backToShelf()

  // ---------- PDF search ----------
  await openFormat('PDF')
  await page.waitForSelector('canvas.pdf-page', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.locator('button[aria-label="全文搜索"]').click()
  await page.locator('.drawer input').fill('Idlewise')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.waitForTimeout(2000)
  const pdfResults = await page.locator('.search-result').count()
  check('pdf search results', pdfResults > 0, String(pdfResults))
  await shot('27-pdf-search')
  await page.locator('.search-result').first().click()
  await page.waitForTimeout(500)

  await page.locator('button[aria-label="阅读设置"]').click()
  await page.waitForTimeout(400)
  const pdfPrefs = (await page.locator('.popover-panel').innerText()).replace(/\s+/g, ' ')
  const pdfRanges = await page.locator('.popover-panel input[type=range]').count()
  const pdfFontChips = await page.locator('.popover-panel .chip').count()
  check('pdf settings hide font controls', pdfRanges === 2 && pdfFontChips === 0, JSON.stringify({ pdfRanges, pdfFontChips }))
  check('pdf settings keep layout and background', /排版/.test(pdfPrefs) && /背景颜色/.test(pdfPrefs), pdfPrefs)
  check('pdf fixed-layout notice', /固定版式/.test(pdfPrefs), pdfPrefs)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // PDF 翻页/滚动排版模式
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await invoke('settings:update', { reader: { flow: 'paginated' } })
  await page.waitForTimeout(1200)
  const pdfPaginatedClass = await page.locator('.pdf-scroll').getAttribute('class')
  check('pdf paginated mode', Boolean(pdfPaginatedClass?.includes('pdf-paginated')), pdfPaginatedClass || '')
  check('pdf paginated single page', (await page.locator('.pdf-page.page-active').count()) === 1)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(900)
  const pdfPage1 = (await page.locator('.reading-footer span').last().innerText()).trim()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)
  const pdfPage2 = (await page.locator('.reading-footer span').last().innerText()).trim()
  check('pdf paginated next page', pdfPage1 !== pdfPage2, `${pdfPage1} -> ${pdfPage2}`)
  await shot('33-pdf-paginated')
  await invoke('settings:update', { reader: { flow: 'scrolled' } })
  await page.waitForTimeout(800)
  const pdfScrolledClass = await page.locator('.pdf-scroll').getAttribute('class')
  check('pdf scrolled mode', !pdfScrolledClass?.includes('pdf-paginated'), pdfScrolledClass || '')
  await backToShelf()

  // ---------- MOBI / AZW3 open ----------
  await openFormat('MOBI')
  await page.waitForSelector('foliate-view', { timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot('28-mobi-reading')
  await backToShelf()
  await openFormat('AZW3')
  await page.waitForSelector('foliate-view', { timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot('29-azw3-reading')
  await backToShelf()

  console.log('FAILURES', failures)
  await app.close()
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error('READER TEST FAILED', err)
  process.exit(1)
})
