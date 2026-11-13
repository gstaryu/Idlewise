const { _electron: electron } = require('@playwright/test')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tests', 'artifacts')
fs.mkdirSync(out, { recursive: true })

function displayAffinity(hwnd) {
  const script = `Add-Type @'
using System;
using System.Runtime.InteropServices;
public class AffinityReader {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint dwAffinity);
}
'@; $a=0; $ok=[AffinityReader]::GetWindowDisplayAffinity([IntPtr]${hwnd}, [ref]$a); "$ok $a"`
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()
}

async function main() {
  const userData = path.join(root, '.idlewise-userdata-protect')
  fs.rmSync(userData, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, IDLEWISE_USERDATA: userData, ELECTRON_DISABLE_SANDBOX: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app-root', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const invoke = (channel, payload) => page.evaluate(([c, p]) => window.idlewise.invoke(c, p), [channel, payload])

  await page.evaluate((paths) => window.dispatchEvent(new CustomEvent('idlewise:import-paths', { detail: paths })), [
    path.join(root, 'tests', 'fixtures', 'sample.txt'),
  ])
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 1, { timeout: 60000 })
  await page.locator('.book-card-main').first().click()
  await page.waitForSelector('.txt-body', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await invoke('window:set-always-on-top', { enabled: true })
  await invoke('window:show')
  await page.waitForTimeout(800)

  const hwnd = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win.getNativeWindowHandle().readBigUInt64LE(0).toString()
  })

  await invoke('window:set-content-protection', { enabled: false })
  await page.waitForTimeout(1000)
  const off = displayAffinity(hwnd)
  await page.screenshot({ path: path.join(out, '30-protection-off-ui.png') })

  await invoke('window:set-content-protection', { enabled: true })
  await page.waitForTimeout(1200)
  const on = displayAffinity(hwnd)
  await page.screenshot({ path: path.join(out, '31-protection-on-ui.png') })

  const [offOk, offValue] = off.split(' ')
  const [onOk, onValue] = on.split(' ')
  const ok = offOk === 'True' && onOk === 'True' && Number(onValue) !== Number(offValue) && [1, 17].includes(Number(onValue))
  console.log(JSON.stringify({ hwnd, off: { ok: offOk, affinity: offValue }, on: { ok: onOk, affinity: onValue }, result: ok ? 'PASS' : 'FAIL' }))
  await app.close()
  if (!ok) process.exit(1)
}

main().catch((err) => {
  console.error('PROTECTION TEST FAILED', err)
  process.exit(1)
})
