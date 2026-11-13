import type { AppSettings } from './types'
import { DEFAULT_WINDOW } from './branding'

export function createDefaultSettings(): AppSettings {
  return {
    window: {
      renderMode: 'transparent',
      opacity: 100,
      backgroundTransparency: 100,
      closeAction: 'tray',
      alwaysOnTop: false,
      defaultSize: { ...DEFAULT_WINDOW },
      background: { type: 'transparent', color: '#f7f5f0', imagePath: null },
    },
    stealth: {
      headerAutoHide: false,
      bodyAutoHide: false,
      hideTaskbarIcon: false,
    },
    contentProtection: false,
    bossKey: {
      enabled: false,
      toggleKey: 'Alt+Z',
      hideKey: 'Alt+X',
    },
    lock: {
      lockOnStartup: false,
    },
    tray: {
      iconPath: null,
      hideTooltip: false,
    },
    browser: {
      zoom: 100,
      hideScrollbar: false,
      mobileMode: false,
      webTransparent: true,
      webTextColorEnabled: false,
      webTextColor: '#2b2b2b',
      video: { speed: 1, pauseWhenHidden: true, pauseOnTabSwitch: true },
      compatHosts: [],
    },
    reader: {
      fontSize: 18,
      lineHeight: 1.8,
      fontFamily: '',
      textColor: '#2b2b2b',
      backgroundColor: '#faf8f3',
      flow: 'scrolled',
      stripBlankLines: false,
      autoPageSeconds: 15,
      autoScrollSpeed: 2,
    },
    auth: {
      enabled: false,
      mode: 'mock',
    },
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** 深合并：只合并普通对象，数组和标量直接覆盖。 */
export function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : (patch as T)
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = (base as Record<string, unknown>)[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = mergeDeep(current, value)
    } else {
      out[key] = value
    }
  }
  return out as T
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** 把任意可能损坏的 JSON 收敛成合法设置，避免 UI 因脏数据崩溃。 */
export function sanitizeSettings(input: unknown): AppSettings {
  const merged = mergeDeep(createDefaultSettings(), input)
  const s = merged

  s.window.renderMode = s.window.renderMode === 'standard' ? 'standard' : 'transparent'
  s.window.opacity = clamp(Number(s.window.opacity) || 0, 0, 100)
  s.window.backgroundTransparency = clamp(Number(s.window.backgroundTransparency) || 0, 0, 100)
  s.window.closeAction = s.window.closeAction === 'quit' ? 'quit' : 'tray'
  s.window.alwaysOnTop = Boolean(s.window.alwaysOnTop)
  s.window.defaultSize.width = clamp(Number(s.window.defaultSize.width) || DEFAULT_WINDOW.width, 320, 4000)
  s.window.defaultSize.height = clamp(Number(s.window.defaultSize.height) || DEFAULT_WINDOW.height, 240, 4000)
  if (
    s.window.background.type !== 'image' &&
    s.window.background.type !== 'color' &&
    s.window.background.type !== 'transparent'
  ) {
    s.window.background.type = 'transparent'
  }
  s.window.background.color = String(s.window.background.color || '#f7f5f0')
  s.window.background.imagePath = s.window.background.imagePath ? String(s.window.background.imagePath) : null

  s.stealth.headerAutoHide = Boolean(s.stealth.headerAutoHide)
  s.stealth.bodyAutoHide = Boolean(s.stealth.bodyAutoHide)
  s.stealth.hideTaskbarIcon = Boolean(s.stealth.hideTaskbarIcon)
  s.contentProtection = Boolean(s.contentProtection)

  s.bossKey.enabled = Boolean(s.bossKey.enabled)
  s.bossKey.toggleKey = String(s.bossKey.toggleKey || 'Alt+Z')
  s.bossKey.hideKey = String(s.bossKey.hideKey || 'Alt+X')
  s.lock.lockOnStartup = Boolean(s.lock.lockOnStartup)

  s.tray.iconPath = s.tray.iconPath ? String(s.tray.iconPath) : null
  s.tray.hideTooltip = Boolean(s.tray.hideTooltip)

  s.browser.zoom = clamp(Number(s.browser.zoom) || 100, 50, 200)
  s.browser.hideScrollbar = Boolean(s.browser.hideScrollbar)
  s.browser.mobileMode = Boolean(s.browser.mobileMode)
  s.browser.webTransparent = Boolean(s.browser.webTransparent)
  s.browser.webTextColorEnabled = Boolean(s.browser.webTextColorEnabled)
  s.browser.webTextColor = /^#[0-9a-f]{6}$/i.test(String(s.browser.webTextColor))
    ? String(s.browser.webTextColor)
    : '#2b2b2b'
  s.browser.video.speed = clamp(Number(s.browser.video.speed) || 1, 0.25, 3)
  s.browser.video.pauseWhenHidden = Boolean(s.browser.video.pauseWhenHidden)
  s.browser.video.pauseOnTabSwitch = Boolean(s.browser.video.pauseOnTabSwitch)
  s.browser.compatHosts = Array.isArray(s.browser.compatHosts) ? s.browser.compatHosts.map(String).filter(Boolean) : []

  s.reader.fontSize = clamp(Number(s.reader.fontSize) || 18, 10, 48)
  s.reader.lineHeight = clamp(Number(s.reader.lineHeight) || 1.8, 1, 3)
  s.reader.fontFamily = String(s.reader.fontFamily || '')
  s.reader.textColor = String(s.reader.textColor || '#2b2b2b')
  s.reader.backgroundColor = String(s.reader.backgroundColor || '#faf8f3')
  s.reader.flow = s.reader.flow === 'paginated' ? 'paginated' : 'scrolled'
  s.reader.stripBlankLines = Boolean(s.reader.stripBlankLines)
  s.reader.autoPageSeconds = clamp(Number(s.reader.autoPageSeconds) || 15, 3, 300)
  s.reader.autoScrollSpeed = clamp(Number(s.reader.autoScrollSpeed) || 2, 0.5, 12)

  s.auth.enabled = Boolean(s.auth.enabled)
  s.auth.mode = s.auth.mode === 'http' ? 'http' : 'mock'

  return s
}
