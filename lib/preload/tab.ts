import { ipcRenderer } from 'electron'

interface TabPrefs {
  opacity: number
  hideScrollbar: boolean
  webTransparent: boolean
  videoSpeed: number
  textColor: string | null
}

let prefs: TabPrefs = { opacity: 100, hideScrollbar: false, webTransparent: false, videoSpeed: 1, textColor: null }
const STYLE_ID = 'idlewise-tab-prefs'
let observer: MutationObserver | null = null

const TRANSPARENT_CSS = `
  :root, :root[dark], .force-light, .force-dark, html, body {
    --bg: transparent !important; --bg0: transparent !important; --bg1: transparent !important;
    --bg2: transparent !important; --background: transparent !important;
    --background-color: transparent !important; --color-background: transparent !important;
    --elevation-low-background: transparent !important; --elevation-high-background: transparent !important;
    --elevation-note-background: transparent !important; --color-information-background: transparent !important;
  }
  html, body, #app, #root, #__next, #__nuxt,
  [id*="app"], [id*="root"], [class*="app"], main, nav, header, footer, section, article, aside,
  [class*="container"], [class*="wrapper"], [class*="layout"], [class*="page"],
  [class*="background"], [class*="bg"] {
    background-color: transparent !important;
    background-image: none !important;
    background: transparent !important;
  }
  html::before, html::after, body::before, body::after,
  #app::before, #app::after, #root::before, #root::after {
    background: transparent !important; background-color: transparent !important; background-image: none !important;
  }
  *:not(:where([class*="os-scrollbar"], [class*="simplebar"], [class*="slimScroll"],
    [class*="el-scrollbar"], [class*="mCSB"], [class*="ps__"], [class*="nano-slider"])) {
    background-color: transparent !important;
    background-image: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
    filter: none !important;
    outline: none !important;
    text-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* Text-only mode: all non-text visual layers disappear. */
  img, picture, video, canvas, svg, iframe, object, embed,
  [class*="icon"], [class*="logo"], [class*="avatar"], [class*="image"],
  [class*="pic"], [class*="cover"], [class*="thumbnail"], [class*="poster"] {
    visibility: hidden !important;
    opacity: 0 !important;
  }
  *::before, *::after {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
`

const TEXT_COLOR_SELECTOR =
  'html, body, p, span, div, a, li, td, th, h1, h2, h3, h4, h5, h6, article, section, header, footer, aside, main, nav, blockquote, strong, em, b, i, u, small, code, pre, label, button, input, textarea, select, option, summary, figcaption, dt, dd, dl'
const TEXT_COLOR_PSEUDO = 'html::before, html::after, body::before, body::after, *::before, *::after'

function textColorCss(color: string | null): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return ''
  return `${TEXT_COLOR_SELECTOR}, ${TEXT_COLOR_PSEUDO} {
    color: ${color} !important;
    -webkit-text-fill-color: ${color} !important;
  }`
}

const MEDIA_SELECTOR =
  'img, picture, video, canvas, svg, iframe, object, embed, [class*="icon"], [class*="logo"], [class*="avatar"], [class*="image"], [class*="pic"], [class*="cover"], [class*="thumbnail"], [class*="poster"]'
const originalInlineStyles = new Map<Element, string | null>()
let enforceTimer: number | null = null

function setImportant(el: Element, property: string, value: string): void {
  try {
    ;(el as HTMLElement).style.setProperty(property, value, 'important')
  } catch {
    /* ignore */
  }
}

function collectElements(root: ParentNode, out: Element[]): void {
  for (const el of root.querySelectorAll('*')) {
    out.push(el)
    if (el.shadowRoot) collectElements(el.shadowRoot, out)
  }
}

function enforceTransparency(): void {
  if (!prefs.webTransparent || !document.documentElement) return
  const elements: Element[] = []
  collectElements(document, elements)
  for (const el of elements) {
    const tag = el.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'TEMPLATE') continue
    if (!originalInlineStyles.has(el)) originalInlineStyles.set(el, el.getAttribute('style'))
    setImportant(el, 'background-color', 'transparent')
    setImportant(el, 'background-image', 'none')
    setImportant(el, 'background', 'transparent')
    setImportant(el, 'border-color', 'transparent')
    setImportant(el, 'box-shadow', 'none')
    setImportant(el, 'text-shadow', 'none')
    setImportant(el, 'filter', 'none')
    setImportant(el, 'outline', 'none')
    setImportant(el, 'backdrop-filter', 'none')
    setImportant(el, '-webkit-backdrop-filter', 'none')
    if (el.matches(MEDIA_SELECTOR)) {
      setImportant(el, 'visibility', 'hidden')
      setImportant(el, 'opacity', '0')
    }
  }
}

function restoreTransparency(): void {
  if (enforceTimer !== null) {
    window.clearTimeout(enforceTimer)
    enforceTimer = null
  }
  for (const [el, original] of originalInlineStyles) {
    try {
      if (original === null) el.removeAttribute('style')
      else el.setAttribute('style', original)
    } catch {
      /* ignore */
    }
  }
  originalInlineStyles.clear()
}

function scheduleTransparencyEnforcement(): void {
  if (enforceTimer !== null) return
  enforceTimer = window.setTimeout(() => {
    enforceTimer = null
    enforceTransparency()
  }, 30)
}

function applyStyle(): void {
  try {
    const root = document.documentElement
    if (!root) return
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      ;(document.head || root).appendChild(style)
    }
    const rules: string[] = []
    if (prefs.opacity < 99.5) rules.push(`html { opacity: ${Math.max(0.01, prefs.opacity / 100)} !important; }`)
    if (prefs.hideScrollbar) {
      rules.push(
        '::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }',
        'html { scrollbar-width: none !important; }'
      )
    }
    try {
      document.body?.classList.toggle('idlewise-app-transparent', prefs.webTransparent)
    } catch {
      /* ignore */
    }
    if (prefs.webTransparent) rules.push(TRANSPARENT_CSS)
    const colorCss = textColorCss(prefs.textColor)
    if (colorCss) rules.push(colorCss)
    const next = rules.join('\n')
    if (style.textContent !== next) style.textContent = next
    if (prefs.webTransparent) scheduleTransparencyEnforcement()
    else if (originalInlineStyles.size) restoreTransparency()
  } catch {
    /* ignore */
  }
}

function applyVideos(): void {
  try {
    document.querySelectorAll('video').forEach((video) => {
      if (Math.abs((video.playbackRate || 1) - prefs.videoSpeed) > 0.01) {
        video.playbackRate = prefs.videoSpeed
      }
    })
  } catch {
    /* ignore */
  }
}

function pauseVideos(): void {
  try {
    document.querySelectorAll('video').forEach((video) => {
      try {
        video.pause()
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }
}

function observeVideos(): void {
  if (observer) return
  try {
    observer = new MutationObserver(() => {
      applyStyle()
      applyVideos()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener(
      'play',
      (event) => {
        const target = event.target
        if (target instanceof HTMLVideoElement) {
          try {
            target.playbackRate = prefs.videoSpeed
          } catch {
            /* ignore */
          }
        }
      },
      true
    )
  } catch {
    /* ignore */
  }
}

ipcRenderer.on('tab:prefs', (_event, next: Partial<TabPrefs>) => {
  prefs = { ...prefs, ...next }
  applyStyle()
  applyVideos()
})

ipcRenderer.on('tab:pause-videos', () => pauseVideos())

function openLinkInNewTab(event: MouseEvent): void {
  if (event.button !== 1) return
  const target = event.target as Element | null
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor || !/^https?:/i.test(anchor.href)) return
  event.preventDefault()
  try {
    ipcRenderer.send('tab:open-link', anchor.href)
  } catch {
    /* ignore */
  }
}

function bootstrap(): void {
  applyStyle()
  observeVideos()
  applyVideos()
  document.addEventListener('auxclick', openLinkInNewTab, true)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
} else {
  bootstrap()
}
