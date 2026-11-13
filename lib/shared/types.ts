export type BookFormat = 'pdf' | 'epub' | 'mobi' | 'azw3' | 'txt'
export type ReaderFlow = 'paginated' | 'scrolled'
export type RenderMode = 'standard' | 'transparent'

export interface AppSettings {
  window: {
    renderMode: RenderMode
    opacity: number
    backgroundTransparency: number
    closeAction: 'tray' | 'quit'
    alwaysOnTop: boolean
    defaultSize: { width: number; height: number }
    background: { type: 'transparent' | 'color' | 'image'; color: string; imagePath: string | null }
  }
  stealth: {
    headerAutoHide: boolean
    bodyAutoHide: boolean
    hideTaskbarIcon: boolean
  }
  contentProtection: boolean
  bossKey: {
    enabled: boolean
    toggleKey: string
    hideKey: string
  }
  lock: {
    lockOnStartup: boolean
  }
  tray: {
    iconPath: string | null
    hideTooltip: boolean
  }
  browser: {
    zoom: number
    hideScrollbar: boolean
    mobileMode: boolean
    webTransparent: boolean
    webTextColorEnabled: boolean
    webTextColor: string
    video: { speed: number; pauseWhenHidden: boolean; pauseOnTabSwitch: boolean }
    compatHosts: string[]
  }
  reader: {
    fontSize: number
    lineHeight: number
    fontFamily: string
    textColor: string
    backgroundColor: string
    flow: ReaderFlow
    stripBlankLines: boolean
    autoPageSeconds: number
    autoScrollSpeed: number
  }
  auth: {
    enabled: boolean
    mode: 'mock' | 'http'
  }
}

export interface Book {
  id: string
  title: string
  author: string
  path: string
  format: BookFormat
  categoryId: string | null
  addedAt: number
  lastReadAt: number
  progress: number
  location: string
  cover: string
  size: number
}

export interface BookCategory {
  id: string
  name: string
  createdAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  visitedAt: number
}

export interface Bookmark {
  id: string
  url: string
  title: string
  createdAt: number
}

export interface MySite {
  id: string
  name: string
  url: string
  compat: boolean
}

export interface TabInfo {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  mobile: boolean
  compat: boolean
}

export interface LockStatus {
  enabled: boolean
  locked: boolean
}

export interface WindowStatePayload {
  opacity: number
  backgroundTransparency: number
  alwaysOnTop: boolean
  contentProtection: boolean
  miniMode: boolean
  maximized: boolean
  skipTaskbar: boolean
  visible: boolean
  transparent: boolean
}

export interface BossKeyStatus {
  ok: boolean
  message?: string
  toggleKey: string
  hideKey: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ReaderPrefs {
  fontSize: number
  lineHeight: number
  fontFamily: string
  textColor: string
  backgroundColor: string
  backgroundTransparency: number
  flow: ReaderFlow
  stripBlankLines: boolean
}

export interface TabPrefs {
  opacity: number
  hideScrollbar: boolean
  webTransparent: boolean
  videoSpeed: number
  textColor: string | null
}

export interface AuthSession {
  userId: string | null
  displayName: string | null
  token: string | null
}
