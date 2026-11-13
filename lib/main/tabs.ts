import { session, WebContentsView } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { AppSettings, Rect, TabInfo, TabPrefs } from '../shared/types'
import { chromeUserAgent, hostOf, toUrl } from '../shared/utils'
import { getSettings, updateSettings } from './settings'
import { runtime } from './state'
import { addHistory } from './history'

interface TabRecord {
  id: string
  view: WebContentsView
  info: TabInfo
  hasPage: boolean
  back: string[]
  forward: string[]
  currentUrl: string
  suppressHistory: boolean
}

const PRELOAD = () => join(__dirname, '../preload/tab.js')
const PARTITION = 'persist:idlewise-browser'

/**
 * 网页只应使用全屏、指针锁定和安全的剪贴板写入。
 * Electron 默认会自动批准权限请求，远程页面可因此在无提示的情况下获得麦克风、
 * 摄像头、地理位置、通知等能力，必须在创建任何标签前收紧。
 */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write'])

function configureBrowserSession(): void {
  const ses = session.fromPartition(PARTITION)
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
}

export class TabManager {
  private tabs = new Map<string, TabRecord>()
  private activeId: string | null = null
  private bounds: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private browserVisible = true
  private bodyHidden = false
  private locked = false

  constructor(private readonly win: Electron.BrowserWindow) {
    configureBrowserSession()
  }

  list(): TabInfo[] {
    return [...this.tabs.values()].map((t) => ({ ...t.info }))
  }

  active(): TabInfo | null {
    if (!this.activeId) return null
    const tab = this.tabs.get(this.activeId)
    return tab ? { ...tab.info } : null
  }

  createTab(url = '', activate = true): TabInfo | null {
    const settings = getSettings()
    const id = randomUUID()
    const view = new WebContentsView({
      webPreferences: {
        preload: PRELOAD(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: PARTITION,
        backgroundThrottling: false,
      },
    })
    view.setBackgroundColor('#ffffff')
    try {
      view.setBounds(this.bounds)
    } catch {
      /* not attached yet */
    }
    view.setVisible(false)
    this.win.contentView.addChildView(view)

    const host = hostOf(url)
    const compat = Boolean(host) && this.isCompatHost(host)
    const info: TabInfo = {
      id,
      url: url ? toUrl(url) : '',
      title: url ? '加载中…' : '新标签页',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      mobile: settings.browser.mobileMode,
      compat,
    }
    const record: TabRecord = {
      id,
      view,
      info,
      hasPage: Boolean(url),
      back: [],
      forward: [],
      currentUrl: url ? toUrl(url) : '',
      suppressHistory: Boolean(url),
    }
    this.tabs.set(id, record)
    this.attach(record)

    if (url) {
      const normalized = toUrl(url)
      info.url = normalized
      info.loading = true
      this.applyUa(record)
      void view.webContents.loadURL(normalized).catch(() => this.fail(record, '加载失败'))
    }
    if (activate) this.setActive(id)
    this.sendTabs()
    this.applyPrefs()
    return { ...info }
  }

  private attach(record: TabRecord): void {
    const wc = record.view.webContents
    const update = () => {
      record.info.canGoBack = record.back.length > 0
      record.info.canGoForward = record.forward.length > 0
      this.sendTabs()
    }
    wc.on('did-start-loading', () => {
      record.info.loading = true
      this.sendTabs()
    })
    wc.on('did-stop-loading', () => {
      record.info.loading = false
      if (/^https?:/i.test(record.info.url)) addHistory(record.info.url, record.info.title)
      update()
    })
    wc.on('page-title-updated', (event, title) => {
      event.preventDefault()
      record.info.title = title || record.info.title
      if (/^https?:/i.test(record.info.url)) addHistory(record.info.url, record.info.title)
      this.sendTabs()
    })
    wc.on('did-navigate', (_e, url) => {
      record.info.url = url
      record.hasPage = true
      record.info.title = record.info.title || hostOf(url) || url
      if (record.suppressHistory) {
        record.suppressHistory = false
      } else if (url !== record.currentUrl) {
        if (record.currentUrl) record.back.push(record.currentUrl)
        record.forward = []
        record.currentUrl = url
      }
      update()
      this.applyUa(record)
      this.applyPrefsTo(record)
      this.syncActiveView()
    })
    wc.on('did-navigate-in-page', (_e, url) => {
      record.info.url = url
      record.hasPage = true
      update()
    })
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame) return
      record.info.loading = false
      record.info.title = `加载失败 (${code}) ${description || ''}`.trim()
      if (url && /^https?:/i.test(url)) addHistory(url, record.info.title)
      this.sendTabs()
    })
    wc.on('dom-ready', () => this.applyPrefsTo(record))
    wc.on('render-process-gone', () => {
      record.info.loading = false
      record.info.title = '页面已崩溃，请刷新'
      this.sendTabs()
    })
    wc.on('ipc-message', (_event, channel, url) => {
      if (channel === 'tab:open-link' && typeof url === 'string' && /^https?:/i.test(url)) {
        this.createTab(url, true)
      }
    })
    wc.setWindowOpenHandler(({ url }) => {
      if (url && /^https?:/i.test(url)) this.createTab(url, true)
      return { action: 'deny' }
    })
  }

  private fail(record: TabRecord, message: string): void {
    record.info.loading = false
    record.info.title = message
    this.sendTabs()
  }

  setActive(id: string): void {
    const next = this.tabs.get(id)
    if (!next) return
    const prev = this.activeId ? this.tabs.get(this.activeId) : null
    if (prev && prev.id !== id) {
      if (getSettings().browser.video.pauseOnTabSwitch) {
        prev.view.webContents.send('tab:pause-videos')
      }
    }
    this.activeId = id
    this.browserVisible = true
    this.syncActiveView()
    this.sendTabs()
    runtime.win?.webContents.send('browser:active', { ...next.info })
  }

  closeTab(id: string): void {
    const record = this.tabs.get(id)
    if (!record) return
    this.tabs.delete(id)
    try {
      this.win.contentView.removeChildView(record.view)
    } catch {
      /* ignore */
    }
    try {
      record.view.webContents.close()
    } catch {
      /* ignore */
    }
    if (this.activeId === id) {
      const next = [...this.tabs.keys()].at(-1) ?? null
      this.activeId = next
      if (next) this.setActive(next)
      else runtime.win?.webContents.send('browser:active', null)
    }
    this.sendTabs()
  }

  navigate(url: string, id?: string): string {
    const record = (id ? this.tabs.get(id) : this.activeId ? this.tabs.get(this.activeId) : null) ?? null
    const normalized = toUrl(url)
    if (!record) {
      if (normalized) this.createTab(normalized, true)
      return normalized
    }
    if (!normalized) {
      this.home(record.id)
      return ''
    }
    record.info.url = normalized
    record.info.title = '加载中…'
    record.info.loading = true
    record.hasPage = true
    if (record.currentUrl && record.currentUrl !== normalized) record.back.push(record.currentUrl)
    record.forward = []
    record.currentUrl = normalized
    record.suppressHistory = true
    this.applyUa(record)
    if (this.activeId === record.id) this.browserVisible = true
    this.syncActiveView()
    this.sendTabs()
    void record.view.webContents.loadURL(normalized).catch(() => this.fail(record, '加载失败'))
    return normalized
  }

  home(id?: string): void {
    const record = (id ? this.tabs.get(id) : this.activeId ? this.tabs.get(this.activeId) : null) ?? null
    if (!record) return
    try {
      record.view.webContents.stop()
    } catch {
      /* ignore */
    }
    record.hasPage = false
    record.info.url = ''
    record.info.title = '新标签页'
    record.info.loading = false
    record.back = []
    record.forward = []
    record.currentUrl = ''
    record.info.canGoBack = false
    record.info.canGoForward = false
    record.view.setVisible(false)
    this.syncActiveView()
    this.sendTabs()
    runtime.win?.webContents.send('browser:active', { ...record.info })
  }

  goBack(): void {
    const record = this.activeRecord()
    if (!record || !record.back.length) return
    const previous = record.back.pop()!
    if (record.currentUrl) record.forward.push(record.currentUrl)
    record.currentUrl = previous
    record.info.url = previous
    record.info.title = '加载中…'
    record.info.loading = true
    record.hasPage = true
    record.suppressHistory = true
    record.info.canGoBack = record.back.length > 0
    record.info.canGoForward = record.forward.length > 0
    this.sendTabs()
    void record.view.webContents.loadURL(previous).catch(() => this.fail(record, '后退失败'))
  }

  goForward(): void {
    const record = this.activeRecord()
    if (!record || !record.forward.length) return
    const next = record.forward.pop()!
    if (record.currentUrl) record.back.push(record.currentUrl)
    record.currentUrl = next
    record.info.url = next
    record.info.title = '加载中…'
    record.info.loading = true
    record.hasPage = true
    record.suppressHistory = true
    record.info.canGoBack = record.back.length > 0
    record.info.canGoForward = record.forward.length > 0
    this.sendTabs()
    void record.view.webContents.loadURL(next).catch(() => this.fail(record, '前进失败'))
  }

  reload(): void {
    const record = this.activeRecord()
    if (record && record.hasPage) record.view.webContents.reload()
  }

  stop(): void {
    this.activeRecord()?.view.webContents.stop()
  }

  setBrowserVisible(visible: boolean): void {
    this.browserVisible = visible
    this.syncActiveView()
    if (!visible && getSettings().browser.video.pauseWhenHidden) {
      this.pauseActiveVideo()
    }
  }

  setBodyHidden(hidden: boolean): void {
    this.bodyHidden = hidden
    this.syncActiveView()
    if (hidden && getSettings().browser.video.pauseWhenHidden) this.pauseActiveVideo()
  }

  pauseActiveVideo(): void {
    if (!getSettings().browser.video.pauseWhenHidden) return
    const record = this.activeRecord()
    try {
      record?.view.webContents.send('tab:pause-videos')
    } catch {
      /* ignore */
    }
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.syncActiveView()
  }

  setBounds(rect: Rect | null): void {
    if (!rect) return
    this.bounds = { ...rect }
    for (const record of this.tabs.values()) {
      try {
        record.view.setBounds(rect)
      } catch {
        /* ignore */
      }
    }
  }

  setZoom(percent: number): number {
    const zoom = Math.min(200, Math.max(50, Math.round(percent)))
    updateSettings({ browser: { zoom } })
    this.applyPrefs()
    return zoom
  }

  setMobile(enabled: boolean): void {
    updateSettings({ browser: { mobileMode: Boolean(enabled) } })
    for (const record of this.tabs.values()) {
      record.info.mobile = Boolean(enabled)
      this.applyUa(record)
    }
    this.applyPrefs()
    // UA 只影响之后的请求；不重载当前页时用户会看到「切了手机模式但页面没变」。
    const active = this.activeRecord()
    if (active?.hasPage) {
      try {
        active.view.webContents.reload()
      } catch {
        /* ignore */
      }
    }
    this.sendTabs()
  }

  toggleCompat(id?: string): boolean {
    const record = (id ? this.tabs.get(id) : this.activeRecord()) ?? null
    if (!record) return false
    const host = hostOf(record.info.url)
    if (!host) return record.info.compat
    const settings = getSettings()
    const has = this.isCompatHost(host)
    const next = has ? settings.browser.compatHosts.filter((h) => h !== host) : [...settings.browser.compatHosts, host]
    updateSettings({ browser: { compatHosts: next } })
    for (const r of this.tabs.values()) {
      r.info.compat = this.isCompatHost(hostOf(r.info.url))
      this.applyUa(r)
    }
    this.applyPrefs()
    this.sendTabs()
    return !has
  }

  setVideoSpeed(speed: number): void {
    updateSettings({ browser: { video: { speed } } })
    this.applyPrefs()
  }

  setPrefs(patch: Partial<AppSettings['browser']>): void {
    updateSettings({ browser: patch })
    this.applyPrefs()
  }

  applyPrefs(): void {
    for (const record of this.tabs.values()) this.applyPrefsTo(record)
  }

  private applyPrefsTo(record: TabRecord): void {
    const s = getSettings()
    try {
      record.view.webContents.setZoomFactor(s.browser.zoom / 100)
    } catch {
      /* ignore */
    }
    const host = hostOf(record.info.url)
    const compat = this.isCompatHost(host)
    record.info.compat = compat
    const prefs: TabPrefs = {
      opacity: compat ? 100 : s.window.renderMode === 'transparent' ? s.window.opacity : 100,
      hideScrollbar: compat ? false : s.browser.hideScrollbar,
      webTransparent: s.browser.webTransparent && !compat,
      videoSpeed: compat ? 1 : s.browser.video.speed,
      textColor: compat || !s.browser.webTextColorEnabled ? null : s.browser.webTextColor,
    }
    try {
      record.view.webContents.send('tab:prefs', prefs)
    } catch {
      /* ignore */
    }
    this.applySurfaceTransparency(record, prefs.webTransparent)
  }

  private applySurfaceTransparency(record: TabRecord, transparent: boolean): void {
    const color = transparent ? '#00000000' : '#ffffff'
    try {
      record.view.setBackgroundColor(color)
    } catch {
      /* ignore */
    }
    try {
      const contents = record.view.webContents as typeof record.view.webContents & {
        setBackgroundColor?: (color: string) => void
      }
      contents.setBackgroundColor?.(color)
    } catch {
      /* ignore */
    }
  }

  private syncActiveView(): void {
    const active = this.activeRecord()
    for (const record of this.tabs.values()) {
      if (active && record.id === active.id) continue
      try {
        record.view.setVisible(false)
      } catch {
        /* ignore */
      }
      try {
        this.win.contentView.removeChildView(record.view)
      } catch {
        /* not attached */
      }
    }
    if (!active || !this.shouldShow() || !active.hasPage) {
      if (active) {
        try {
          active.view.setVisible(false)
        } catch {
          /* ignore */
        }
        try {
          this.win.contentView.removeChildView(active.view)
        } catch {
          /* not attached */
        }
      }
      return
    }
    try {
      this.win.contentView.removeChildView(active.view)
    } catch {
      /* not attached */
    }
    try {
      this.win.contentView.addChildView(active.view)
      active.view.setBounds(this.bounds)
      active.view.setVisible(true)
    } catch {
      /* ignore */
    }
  }

  private applyUa(record: TabRecord): void {
    const s = getSettings()
    const mobile = s.browser.mobileMode
    const chrome = process.versions.chrome || '140'
    try {
      record.view.webContents.setUserAgent(chromeUserAgent(chrome, mobile))
    } catch {
      /* ignore */
    }
  }

  isCompatHost(host: string): boolean {
    if (!host) return false
    const hosts = getSettings().browser.compatHosts
    return hosts.some((h) => host === h || host.endsWith(`.${h}`))
  }

  private activeRecord(): TabRecord | null {
    return this.activeId ? (this.tabs.get(this.activeId) ?? null) : null
  }

  private shouldShow(): boolean {
    // 原生 WebContentsView 永远盖在渲染层之上；设置面板/锁屏打开时必须保持隐藏，
    // 即使渲染层因弹层关闭时序晚到一次 set-visible(true) 也不能重新盖住遮罩。
    return this.browserVisible && !this.bodyHidden && !this.locked && !runtime.overlayOpen
  }

  private sendTabs(): void {
    runtime.win?.webContents.send('browser:tabs', this.list())
  }

  destroy(): void {
    for (const record of this.tabs.values()) {
      try {
        this.win.contentView.removeChildView(record.view)
      } catch {
        /* ignore */
      }
      try {
        record.view.webContents.close()
      } catch {
        /* ignore */
      }
    }
    this.tabs.clear()
    this.activeId = null
  }
}
