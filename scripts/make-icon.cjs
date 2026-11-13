const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#245c4e"/>
      <stop offset="0.55" stop-color="#2f6f5e"/>
      <stop offset="1" stop-color="#8cc7b3"/>
    </linearGradient>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="1" stop-color="#e9f6f0" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#g)"/>
  <path d="M118 156c0-20 16-36 36-36h86c25 0 45 20 45 45v245c-12-14-29-22-49-22h-82c-20 0-36-16-36-36V156z" fill="url(#p)"/>
  <path d="M394 156c0-20-16-36-36-36h-86c-25 0-45 20-45 45v245c12-14 29-22 49-22h82c20 0 36-16 36-36V156z" fill="url(#p)" opacity="0.86"/>
  <path d="M258 168v238" stroke="#245c4e" stroke-width="9" stroke-linecap="round" opacity="0.4"/>
  <path d="M166 206h62M166 248h62M166 290h44" stroke="#2f6f5e" stroke-width="8" stroke-linecap="round" opacity="0.45"/>
  <path d="M286 206h62M286 248h62M286 290h44" stroke="#2f6f5e" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
</svg>`

async function main() {
  const out = path.join(__dirname, '..', 'resources', 'build')
  fs.mkdirSync(out, { recursive: true })
  const buffer = Buffer.from(svg)
  await sharp(buffer).resize(512, 512).png().toFile(path.join(out, 'icon.png'))
  await sharp(buffer).resize(32, 32).png().toFile(path.join(out, 'tray.png'))
  console.log('icons written')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
