const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;color:#222;line-height:1.7;padding:48px}
h1{font-size:28px;margin-bottom:8px} h2{font-size:20px;margin-top:28px}
.meta{color:#666;font-size:12px;margin-bottom:28px} p{font-size:14px}
</style></head><body>
<h1>Idlewise PDF Sample</h1>
<div class="meta">A small public-domain-style test document for the 偷闲有道 reader.</div>
<h2>Chapter One: The Quiet Window</h2>
<p>The rain fell softly against the glass. Lin Zhou opened the old book again and let the words settle around him like a warm room. Reading, he thought, is not a race; it is a way of noticing what the page has been trying to say.</p>
<p>He turned to the second page and found a pressed ginkgo leaf. It had been there for years, brittle and golden, holding the shape of an afternoon he could no longer remember.</p>
<div style="page-break-before:always"></div>
<h2>Chapter Two: A Slow Morning</h2>
<p>By dawn the rain had stopped. The city began to wake, and the first bus moved along the street below. Lin Zhou closed the book, finished the last line, and sat still for a moment.</p>
<p>Search for the word <strong>Idlewise</strong> or <strong>reader</strong> to verify full-text search in this PDF.</p>
<div style="page-break-before:always"></div>
<h2>Chapter Three: The Journey</h2>
<p>A month later he carried the book to another city. The train passed through tunnels and open fields, and the landscape turned like pages. The story was the same, but he was not.</p>
<p>The end.</p>
</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  const target = path.join(__dirname, '..', 'tests', 'fixtures', 'sample.pdf')
  fs.writeFileSync(target, data)
  console.log('PDF written', target, data.length)
  app.quit()
})
