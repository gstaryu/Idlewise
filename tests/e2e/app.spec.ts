import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe.configure({ mode: 'serial' })

test('window controls, multi-tab browser and TXT reader', async () => {
  const root = process.cwd()
  const userData = path.join(root, '.idlewise-userdata-e2e')
  fs.rmSync(userData, { recursive: true, force: true })

  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()

  await expect(page.locator('.app-root')).toBeVisible({ timeout: 30000 })

  // 迷你模式 + 恢复
  await page.locator('button[aria-label="迷你模式"]').click()
  await expect(page.locator('.app-root')).toHaveClass(/mini-mode/)
  await expect(page.locator('.rail')).toBeVisible()
  await expect(page.locator('.toolbar')).toBeVisible()
  await page.locator('button[aria-label="恢复窗口"]').click()
  await expect(page.locator('.app-root')).not.toHaveClass(/mini-mode/)

  // 浏览器多标签
  await page.locator('button[aria-label="浏览"]').first().click()
  await expect(page.locator('.browser-toolbar')).toBeVisible()
  const before = await page.locator('.tab-item').count()
  await page.locator('.tab-add').click()
  await expect(page.locator('.tab-item')).toHaveCount(before + 1)
  await page.locator('.tab-item.active .tab-close').click()
  await expect(page.locator('.tab-item')).toHaveCount(before)

  // 阅读器导入并打开 TXT
  await page.locator('button[aria-label="书架"]').first().click()
  await page.evaluate(
    (paths) => {
      ;(window as any).dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths }))
    },
    [path.join(root, 'tests', 'fixtures', 'sample.txt')]
  )
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 60000 })
  await page.locator('.book-card-main').first().click()
  await expect(page.locator('.txt-body')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.reading-header')).toBeVisible()

  await app.close()
})
