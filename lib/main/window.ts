import { app, BrowserWindow, dialog, powerMonitor, screen, shell, type Rectangle } from 'electron'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import fse from 'fs-extra'
import appIcon from '@/resources/build/icon.png?asset'
import { APP_NAME, DEFAULT_WINDOW, MIN_WINDOW } from '../shared/branding'
import type { AppSettings, WindowStatePayload } from '../shared/types'
import { flushSettings, getSettings, updateSettings } from './settings'
import { loadWindowState, pauseWindowStateTracking, trackWindowState } from './window-state'
import { runtime } from './state'
import { absoluteAsset, assetUrl } from './protocol'
import { createTray, refreshTray } from './tray'
import { applyBossKeys } from './bosskey'
import { setTaskbarHidden } from './win32'
import { resetAutoHide, startAutoHide } from './autohide'

export function createMainWindow(): BrowserWindow {
  const settings = getSettings()
  const saved = loadWindowState()
  const width = saved?.width ?? settings.window.defaultSize.width ?? DEFAULT_WINDOW.width
  const height = saved?.height ?? settings.window.defaultSize.height ?? DEFAULT_WINDOW.height

  const win = new BrowserWindow({
    width,
    height,
    x: saved?.x,
    y: saved?.y,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    show: false,
    // 始终使用透明窗口：透明/不透明只切换渲染层背景与 CSS 透明度，切换即时生效，无需重启。
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    titleBarStyle: 'hidden',
    title: APP_NAME,
    icon: appIcon,
    alwaysOnTop: settings.window.alwaysOnTop,
    maximizable: true,
    minimizable: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  runtime.win = win
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const x = saved.x as number
    const y = saved.y as number
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.bounds
      return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y
    })
    if (!visible) win.center()
  }
  win.setAlwaysOnTop(settings.window.alwaysOnTop, settings.window.alwaysOnTop ? 'screen-saver' : 'normal')
  win.setContentProtection(settings.contentProtection)
  setTaskbarHidden(win, settings.stealth.hideTaskbarIcon)
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)
  win.setOpacity(1)

  win.on('close', (event) => {
    if (runtime.quitting) return
    if (getSettings().window.closeAction === 'quit') {
      event.preventDefault()
      runtime.quitting = true
      app.quit()
      return
    }
    event.preventDefault()
    win.hide()
    sendWindowState()
  })

  win.on('blur', () => {
    const s = getSettings()
    if (s.stealth.bodyAutoHide) hideBodyOnBlur()
    if (s.stealth.headerAutoHide) hideHeaderOnBlur()
  })

  win.on('maximize', () => {
    stopDrag()
    sendWindowState()
  })
  win.on('unmaximize', () => {
    stopDrag()
    sendWindowState()
  })
  win.on('show', sendWindowState)
  win.on('hide', () => {
    runtime.tabs?.pauseActiveVideo()
    sendWindowState()
  })
  win.on('minimize', () => runtime.tabs?.pauseActiveVideo())
  win.on('resize', () => {
    sendWindowState()
    if (runtime.tabs) runtime.tabs.setBounds(runtime.contentRect)
  })
  win.on('move', () => {
    if (runtime.tabs) runtime.tabs.setBounds(runtime.contentRect)
  })

  win.once('ready-to-show', () => {
    win.show()
    sendWindowState()
    applyOpacity(settings.window.opacity)
    startAutoHide()
    resetAutoHide()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  trackWindowState(win)
  createTray(win)
  applyBossKeys()
  startAutoHide()

  screen.on('display-metrics-changed', () => {
    const current = runtime.win
    if (!current || current.isDestroyed()) return
    const bounds = current.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const maxWidth = Math.round(display.workArea.width * 0.96)
    const maxHeight = Math.round(display.workArea.height * 0.96)
    const width = Math.min(bounds.width, maxWidth)
    const height = Math.min(bounds.height, maxHeight)
    if (width !== bounds.width || height !== bounds.height) {
      current.setBounds({ ...bounds, width, height })
    }
  })

  screen.on('display-removed', () => {
    const current = runtime.win
    if (!current || current.isDestroyed()) return
    const bounds = current.getBounds()
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.bounds
      return (
        bounds.x < area.x + area.width &&
        bounds.x + bounds.width > area.x &&
        bounds.y < area.y + area.height &&
        bounds.y + bounds.height > area.y
      )
    })
    if (!visible) current.center()
  })

  powerMonitor.on('resume', () => {
    revealWindow()
    if (runtime.tabs) runtime.tabs.setBounds(runtime.contentRect)
    resetAutoHide()
    sendWindowState()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    sendWindowState()
    sendBackground()
    applyOpacity(getSettings().window.opacity)
  })

  return win
}

export function send(channel: string, payload?: unknown): void {
  if (runtime.win && !runtime.win.isDestroyed()) runtime.win.webContents.send(channel, payload)
}

export function windowPayload(): WindowStatePayload {
  const win = runtime.win
  const s = getSettings()
  return {
    opacity: s.window.opacity,
    backgroundTransparency: s.window.backgroundTransparency,
    alwaysOnTop: s.window.alwaysOnTop,
    contentProtection: s.contentProtection,
    miniMode: runtime.miniMode,
    maximized: win ? win.isMaximized() : false,
    skipTaskbar: s.stealth.hideTaskbarIcon,
    visible: win ? win.isVisible() : false,
    transparent: s.window.renderMode === 'transparent',
  }
}

export function sendWindowState(): void {
  send('window:state', windowPayload())
}

export function applyOpacity(percent: number): void {
  const win = runtime.win
  if (!win) return
  win.setOpacity(1)
  send('window:opacity', percent)
  runtime.tabs?.applyPrefs()
  sendWindowState()
}

export function applyBackgroundTransparency(percent: number): void {
  send('window:background-transparency', percent)
}

/** 拖动滑杆时只预览，不写设置，避免整条设置链路造成卡顿。 */
export function previewAppearance(payload: { opacity?: number; backgroundTransparency?: number }): void {
  const win = runtime.win
  if (!win) return
  win.setOpacity(1)
  if (typeof payload.opacity === 'number') {
    send('window:opacity', payload.opacity)
    runtime.tabs?.applyPrefs()
  }
  if (typeof payload.backgroundTransparency === 'number') {
    send('window:background-transparency', payload.backgroundTransparency)
  }
}

export function applyWindowSettings(): void {
  const s = getSettings()
  const win = runtime.win
  if (!win) return
  win.setAlwaysOnTop(s.window.alwaysOnTop, s.window.alwaysOnTop ? 'screen-saver' : 'normal')
  win.setContentProtection(s.contentProtection)
  win.setBackgroundColor('#00000000')
  setTaskbarHidden(win, s.stealth.hideTaskbarIcon)
  applyOpacity(s.window.opacity)
  applyBackgroundTransparency(s.window.backgroundTransparency)
  sendBackground()
  resetAutoHide()
  runtime.tabs?.applyPrefs()
  sendWindowState()
}

export function sendBackground(): void {
  const s = getSettings()
  const bg = s.window.background
  send('window:background', {
    type: bg.type,
    color: bg.color,
    url: bg.type === 'image' && bg.imagePath ? assetUrl(bg.imagePath) : null,
  })
}

export function setMiniMode(enabled: boolean): boolean {
  const win = runtime.win
  if (!win) return runtime.miniMode
  if (enabled && !runtime.miniMode) {
    runtime.savedBounds = win.getNormalBounds()
    pauseWindowStateTracking(true)
    win.setMinimumSize(420, 300)
    const width = 440
    const height = 360
    const b = win.getBounds()
    win.setBounds({ x: b.x, y: b.y, width, height })
    runtime.miniMode = true
  } else if (!enabled && runtime.miniMode) {
    win.setMinimumSize(MIN_WINDOW.width, MIN_WINDOW.height)
    const saved = runtime.savedBounds
    if (saved) win.setBounds(saved)
    else win.setSize(DEFAULT_WINDOW.width, DEFAULT_WINDOW.height)
    pauseWindowStateTracking(false)
    runtime.miniMode = false
  }
  send('window:mini', runtime.miniMode)
  sendWindowState()
  return runtime.miniMode
}

export function toggleMaximize(): boolean {
  const win = runtime.win
  if (!win) return false
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return win.isMaximized()
}

export function startDrag(): void {
  const win = runtime.win
  if (!win) return
  stopDrag()
  const cursor = screen.getCursorScreenPoint()
  const bounds = win.getNormalBounds()
  const dx = cursor.x - bounds.x
  const dy = cursor.y - bounds.y
  runtime.dragTimer = setInterval(() => {
    try {
      const p = screen.getCursorScreenPoint()
      win.setPosition(p.x - dx, p.y - dy)
    } catch {
      stopDrag()
    }
  }, 16)
}

export function stopDrag(): void {
  if (runtime.dragTimer) {
    clearInterval(runtime.dragTimer)
    runtime.dragTimer = null
  }
}

export function setDefaultSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(MIN_WINDOW.width, Math.round(width))
  const h = Math.max(MIN_WINDOW.height, Math.round(height))
  updateSettings({ window: { defaultSize: { width: w, height: h } } })
  const win = runtime.win
  if (win) {
    win.setSize(w, h, true)
    win.center()
  }
  return { width: w, height: h }
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

export async function pickBackgroundImage(): Promise<string | null> {
  const win = runtime.win
  const options: Electron.OpenDialogOptions = {
    title: '选择背景图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const src = result.filePaths[0]
  const ext = extname(src).toLowerCase()
  if (!IMAGE_EXT.has(ext)) return null
  const rel = join('backgrounds', `${randomUUID()}${ext}`)
  const dest = absoluteAsset(rel)
  await fse.ensureDir(join(absoluteAsset('backgrounds')))
  await fse.copy(src, dest, { overwrite: true })
  updateSettings({ window: { background: { type: 'image', imagePath: rel } } })
  return rel
}

export async function pickTrayIcon(): Promise<string | null> {
  const win = runtime.win
  const options: Electron.OpenDialogOptions = {
    title: '选择托盘图标',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'ico', 'jpg', 'jpeg', 'webp'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const src = result.filePaths[0]
  const ext = extname(src).toLowerCase()
  const rel = join('tray', `${randomUUID()}${ext}`)
  const dest = absoluteAsset(rel)
  await fse.ensureDir(absoluteAsset('tray'))
  await fse.copy(src, dest, { overwrite: true })
  updateSettings({ tray: { iconPath: rel } })
  refreshTray()
  return rel
}

export function relaunchApp(): void {
  runtime.quitting = true
  // app.exit() 会立即结束进程，必须先同步写入，否则渲染模式等设置会在重启后丢失。
  flushSettings()
  app.relaunch()
  app.exit(0)
}

export function revealWindow(): void {
  const win = runtime.win
  if (!win) return
  if (runtime.miniMode) {
    /* keep mini */
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  resetAutoHide()
  sendWindowState()
}

export function hideWindow(): void {
  const win = runtime.win
  if (!win) return
  win.hide()
  sendWindowState()
}

/** 关闭按钮/Alt+F4 按设置选择隐藏到托盘或直接退出。 */
export function closeWindow(): void {
  if (getSettings().window.closeAction === 'quit') {
    runtime.quitting = true
    app.quit()
    return
  }
  hideWindow()
}

export function toggleWindow(): boolean {
  const win = runtime.win
  if (!win) return false
  if (win.isVisible() && !win.isMinimized()) {
    win.minimize()
    sendWindowState()
    return false
  }
  revealWindow()
  return true
}

export function setRenderMode(mode: AppSettings['window']['renderMode']): void {
  updateSettings({ window: { renderMode: mode } })
  applyWindowSettings()
}

export function updateRectState(header: Rectangle | null, content: Rectangle | null): void {
  if (header) runtime.headerRect = header
  if (content) {
    runtime.contentRect = content
    runtime.tabs?.setBounds(content)
  }
}

function hideBodyOnBlur(): void {
  import('./autohide').then((m) => m.hideBody())
}
function hideHeaderOnBlur(): void {
  import('./autohide').then((m) => m.hideHeader()).catch(() => undefined)
}
