const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const checks = [
  ['resources/build/icon.png', 512],
  ['resources/build/tray.png', 32],
  ['app/assets/logo.png', 128],
]
let failures = 0
app.whenReady().then(() => {
  for (const [file, size] of checks) {
    const full = path.join(root, file)
    const image = nativeImage.createFromPath(full)
    const actual = image.getSize()
    const ok = !image.isEmpty() && actual.width === size && actual.height === size
    console.log(ok ? 'PASS' : 'FAIL', file, JSON.stringify(actual))
    if (!ok) failures += 1
    const bitmap = image.toBitmap()
    const cornerAlpha = bitmap[3]
    const transparentCorner = cornerAlpha === 0
    console.log(transparentCorner ? 'PASS' : 'FAIL', `${file} transparent corner`, String(cornerAlpha))
    if (!transparentCorner) failures += 1
  }
  const icoFile = path.join(root, 'resources', 'build', 'icon.ico')
  const ico = fs.readFileSync(icoFile)
  const icoCount = ico.readUInt16LE(4)
  const icoSizes = []
  for (let index = 0; index < icoCount; index += 1) {
    const width = ico.readUInt8(6 + index * 16)
    icoSizes.push(width === 0 ? 256 : width)
  }
  const icoOk = ico.readUInt16LE(2) === 1 && icoCount >= 6 && icoSizes.includes(256)
  console.log(icoOk ? 'PASS' : 'FAIL', 'icon.ico entries', JSON.stringify(icoSizes))
  if (!icoOk) failures += 1
  console.log('FAILURES', failures)
  app.exit(failures ? 1 : 0)
})

app.on('window-all-closed', () => app.quit())
