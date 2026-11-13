const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const pkg = require('../package.json')
const root = path.resolve(__dirname, '..')
const exe = process.argv[2] || path.join(root, 'dist', `idlewise-${pkg.version}-portable.exe`)
if (!fs.existsSync(exe)) {
  console.error('portable executable not found:', exe)
  process.exit(1)
}
const userData = path.join(root, `.idlewise-userdata-startup-${Date.now()}`)
const script = `
$env:IDLEWISE_USERDATA = '${userData.replace(/'/g, "''")}'
$sw=[Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath '${exe.replace(/'/g, "''")}' -PassThru
while ($sw.Elapsed.TotalSeconds -lt 120) {
  $c = Get-Process -Name idlewise -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { break }
  Start-Sleep -Milliseconds 100
}
$spawn = [math]::Round($sw.Elapsed.TotalSeconds, 2)
while ($sw.Elapsed.TotalSeconds -lt 150) {
  $c = Get-Process -Name idlewise -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($c) { break }
  Start-Sleep -Milliseconds 100
}
$total = [math]::Round($sw.Elapsed.TotalSeconds, 2)
Get-Process -Name idlewise -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not $p.HasExited) { $p.Kill() }
Write-Output "$spawn $total"
`
let output = ''
try {
  output = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    timeout: 180000,
  }).trim()
} finally {
  try {
    fs.rmSync(userData, { recursive: true, force: true })
  } catch {
    /* 进程刚退出时目录可能仍被占用，交给系统清理 */
  }
}
const [spawn, total] = output.split(/\s+/).map(Number)
const ok = Number.isFinite(total) && total > 0 && total < 15
console.log(ok ? 'PASS' : 'FAIL', 'portable startup', JSON.stringify({ extractionSeconds: spawn, windowSeconds: total }))
process.exit(ok ? 0 : 1)
