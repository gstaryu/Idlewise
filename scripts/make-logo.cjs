const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = process.argv[2] || 'C:\\Users\\start\\Downloads\\logo.jpg'

function makeTransparentExterior(image) {
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const isWhite = (index) => {
    const offset = index * 4
    // 设计稿外部是略带蓝灰的白底（约 237,242,245），阈值放宽到 225 才能完整抠掉。
    return bitmap[offset] > 225 && bitmap[offset + 1] > 225 && bitmap[offset + 2] > 225
  }
  const push = (index) => {
    if (seen[index] || !isWhite(index)) return
    seen[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    bitmap[index * 4 + 3] = 0
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }
  return nativeImage.createFromBitmap(bitmap, { width, height })
}

function icoFromPngs(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ size, png }, index) => {
    const base = index * 16
    dir.writeUInt8(size >= 256 ? 0 : size, base)
    dir.writeUInt8(size >= 256 ? 0 : size, base + 1)
    dir.writeUInt8(0, base + 2)
    dir.writeUInt8(0, base + 3)
    dir.writeUInt16LE(1, base + 4)
    dir.writeUInt16LE(32, base + 6)
    dir.writeUInt32LE(png.length, base + 8)
    dir.writeUInt32LE(offset, base + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((entry) => entry.png)])
}

app.whenReady().then(() => {
  const image = nativeImage.createFromPath(source)
  if (image.isEmpty()) throw new Error(`cannot read logo: ${source}`)
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
  const images = new Map()
  for (const size of sizes) {
    // 先缩放到目标尺寸再抠掉外部浅色底，避免透明像素在缩放时与背景插值产生灰边。
    images.set(size, makeTransparentExterior(image.resize({ width: size, height: size, quality: 'best' })))
  }
  const outputs = [
    [path.join(root, 'resources', 'build', 'icon.png'), 512],
    [path.join(root, 'resources', 'build', 'tray.png'), 32],
    [path.join(root, 'app', 'assets', 'logo.png'), 128],
  ]
  for (const [file, size] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, images.get(size).toPNG())
    console.log('wrote', file, size)
  }
  const ico = icoFromPngs(
    [16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: images.get(size).toPNG() }))
  )
  const icoPath = path.join(root, 'resources', 'build', 'icon.ico')
  fs.writeFileSync(icoPath, ico)
  console.log('wrote', icoPath, ico.length, 'bytes')
  app.exit(0)
})

app.on('window-all-closed', () => app.quit())
