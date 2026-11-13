const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')

function exStyle(hwnd) {
  const script = `Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ExStyleReader {
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
}
'@; [int64][ExStyleReader]::GetWindowLongPtr([IntPtr]${hwnd}, -20)`
  return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim())
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-taskbar')
  fs.rmSync(userData, { recursive: true, force: true })
  const executablePath = process.env.IDLEWISE_EXE
  const app = executablePath
    ? await electron.launch({
        executablePath,
        args: [],
        env: { ...process.env, IDLEWISE_USERDATA: userData },
      })
    : await electron.launch({
        args: ['.'],
        cwd: root,
        env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
      })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const hwnd = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE(0).toString())
  const before = exStyle(hwnd)
  await page.evaluate(() => window.idlewise.invoke('settings:update', { stealth: { hideTaskbarIcon: true } }))
  await page.waitForTimeout(800)
  const after = exStyle(hwnd)
  await page.evaluate(() => window.idlewise.invoke('settings:update', { stealth: { hideTaskbarIcon: false } }))
  await page.waitForTimeout(800)
  const restored = exStyle(hwnd)
  const toolWindow = 0x80
  const appWindow = 0x40000
  console.log(
    JSON.stringify({
      hwnd,
      before: before.toString(16),
      after: after.toString(16),
      restored: restored.toString(16),
      toolwindow: Boolean(after & toolWindow),
      restoredToolwindow: Boolean(restored & toolWindow),
      appwindow: Boolean(after & appWindow),
    })
  )
  await app.close()
  if (!(after & toolWindow) || restored & toolWindow) process.exit(1)
}

main().catch((err) => {
  console.error('TASKBAR TEST FAILED', err)
  process.exit(1)
})
