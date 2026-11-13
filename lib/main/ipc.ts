import { app, dialog, ipcMain, shell } from 'electron'
import fse from 'fs-extra'
import { basename, dirname, extname, join } from 'path'
import { randomUUID } from 'crypto'
import { APP_NAME, APP_VERSION } from '../shared/branding'
import type { AppSettings } from '../shared/types'
import { getSettings, resetSettings, subscribeSettings, updateSettings } from './settings'
import { runtime } from './state'
import {
  applyOpacity,
  setRenderMode,
  applyWindowSettings,
  hideWindow,
  pickBackgroundImage,
  pickTrayIcon,
  relaunchApp,
  revealWindow,
  closeWindow,
  previewAppearance,
  send,
  sendBackground,
  sendWindowState,
  setDefaultSize,
  setMiniMode,
  startDrag,
  stopDrag,
  toggleMaximize,
  toggleWindow,
  updateRectState,
  windowPayload,
} from './window'
import { closeOverlay, isOverlayContents, openOverlay, resizeOverlay } from './overlay'
import { setOverlayOpen } from './autohide'
import { applyBossKeys, bossKeyStatus } from './bosskey'
import { lock } from './lock'
import { refreshTray } from './tray'
import { addHistory, clearHistory, listHistory, removeHistory } from './history'
import { addBookmark, isBookmarked, listBookmarks, removeBookmark, removeBookmarkByUrl } from './bookmarks'
import { addSite, listSites, removeSite, updateSite } from './sites'
import {
  addCategory,
  listBooks,
  listCategories,
  removeBook,
  removeCategory,
  renameCategory,
  setBookCategory,
  setProgress,
  upsertBook,
} from './library'
import { configureAuth, getAuthService } from './auth'
import { userDataDir } from './store'

type Handler = (payload: any) => unknown | Promise<unknown>

let sideEffectTimer: NodeJS.Timeout | null = null
function scheduleSideEffects(): void {
  if (sideEffectTimer) clearTimeout(sideEffectTimer)
  sideEffectTimer = setTimeout(() => {
    sideEffectTimer = null
    refreshTray()
    applyBossKeys()
  }, 180)
}

const handlers: Record<string, Handler> = {
  'settings:get': () => getSettings(),
  'settings:update': (payload: Partial<AppSettings>) => {
    const next = updateSettings(payload)
    scheduleSideEffects()
    return next
  },
  'settings:reset': () => {
    const next = resetSettings()
    scheduleSideEffects()
    return next
  },

  'window:state': () => windowPayload(),
  'window:set-opacity': (payload: { opacity: number }) => {
    updateSettings({ window: { opacity: payload.opacity } })
    applyOpacity(payload.opacity)
    return getSettings().window.opacity
  },
  'window:preview-opacity': (payload: { opacity?: number; backgroundTransparency?: number }) => {
    previewAppearance(payload)
    return true
  },
  'window:set-background-transparency': (payload: { value: number }) => {
    updateSettings({ window: { backgroundTransparency: payload.value } })
    return getSettings().window.backgroundTransparency
  },
  'window:set-always-on-top': (payload: { enabled: boolean }) => {
    updateSettings({ window: { alwaysOnTop: Boolean(payload.enabled) } })
    applyWindowSettings()
    return getSettings().window.alwaysOnTop
  },
  'window:set-content-protection': (payload: { enabled: boolean }) => {
    updateSettings({ contentProtection: Boolean(payload.enabled) })
    applyWindowSettings()
    return getSettings().contentProtection
  },
  'window:set-mini': (payload: { enabled: boolean }) => setMiniMode(Boolean(payload.enabled)),
  'window:toggle-maximize': () => toggleMaximize(),
  'window:minimize': () => {
    runtime.win?.minimize()
    sendWindowState()
    return true
  },
  'window:close-hide': () => {
    closeWindow()
    return true
  },
  'window:show': () => {
    revealWindow()
    return true
  },
  'window:set-default-size': (payload: { width: number; height: number }) =>
    setDefaultSize(payload.width, payload.height),
  'window:pick-background': async () => {
    const path = await pickBackgroundImage()
    sendBackground()
    return path
  },
  'window:set-background-color': (payload: { color: string }) => {
    updateSettings({ window: { background: { type: 'color', color: payload.color, imagePath: null } } })
    sendBackground()
    return getSettings().window.background
  },
  'window:clear-background': () => {
    updateSettings({ window: { background: { type: 'transparent', color: '#f7f5f0', imagePath: null } } })
    sendBackground()
    return getSettings().window.background
  },
  'window:set-background-image-path': async (payload: { path: string }) => {
    const ext = extname(payload.path).toLowerCase()
    const rel = join('backgrounds', `${randomUUID()}${ext}`)
    const dest = join(userDataDir(), 'assets', rel)
    await fse.ensureDir(dirname(dest))
    await fse.copy(payload.path, dest, { overwrite: true })
    updateSettings({ window: { background: { type: 'image', imagePath: rel } } })
    sendBackground()
    return rel
  },
  'window:set-render-mode': (payload: { mode: 'standard' | 'transparent' }) => {
    setRenderMode(payload.mode)
    return true
  },
  'window:relaunch': () => {
    relaunchApp()
    return true
  },
  'window:drag-start': () => {
    startDrag()
    return true
  },
  'window:drag-stop': () => {
    stopDrag()
    return true
  },
  'window:report-header-rect': (payload: { x: number; y: number; width: number; height: number }) => {
    updateRectState(payload, null)
    return true
  },
  'window:report-content-rect': (payload: { x: number; y: number; width: number; height: number }) => {
    updateRectState(null, payload)
    runtime.tabs?.setBounds(payload)
    return true
  },
  'window:report-overlay': (payload: { open: boolean }) => {
    setOverlayOpen(Boolean(payload.open))
    return true
  },
  'window:report-popover': (payload: { open: boolean }) => {
    runtime.popoverOpen = Boolean(payload.open)
    return true
  },
  'overlay:open': (payload: {
    kind: 'opacity' | 'browser' | 'stealth' | 'fontcolor'
    anchor?: { x: number; y: number; width: number; height: number }
    context?: { readerFormat?: string | null }
  }) => openOverlay(payload.kind, payload.anchor, payload.context),
  'overlay:measure': (payload: { width: number; height: number }) =>
    resizeOverlay(Number(payload.width), Number(payload.height)),
  'overlay:close': () => closeOverlay(),
  'window:app-info': () => ({
    name: APP_NAME,
    version: APP_VERSION,
    userData: userDataDir(),
    packaged: app.isPackaged,
    platform: process.platform,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
  'window:open-user-data': async () => {
    await shell.openPath(userDataDir())
    return true
  },

  'bosskey:set': (payload: { enabled: boolean; toggleKey: string; hideKey: string }) => {
    updateSettings({ bossKey: payload })
    const status = applyBossKeys()
    send('bosskey:status', status)
    return status
  },
  'bosskey:apply': () => {
    const status = applyBossKeys()
    send('bosskey:status', status)
    return status
  },
  'bosskey:get': () => bossKeyStatus(),

  'lock:status': () => lock.status(),
  'lock:set-pin': (payload: { pin: string }) => {
    const result = lock.setPin(payload.pin)
    lock.broadcast()
    return result
  },
  'lock:verify': (payload: { pin: string }) => ({ ok: lock.verify(payload.pin) }),
  'lock:disable': (payload: { pin: string }) => {
    const ok = lock.disable(payload.pin)
    lock.broadcast()
    return { ok }
  },
  'lock:now': () => lock.lockNow(),
  'lock:unlock': (payload: { pin: string }) => {
    const status = lock.unlock(payload.pin)
    if (!status.locked) {
      send('stealth:body', true)
      send('stealth:header', true)
    }
    return status
  },
  'lock:set-on-startup': (payload: { enabled: boolean }) => {
    updateSettings({ lock: { lockOnStartup: Boolean(payload.enabled) } })
    return getSettings().lock
  },

  'tray:pick-icon': async () => {
    const path = await pickTrayIcon()
    refreshTray()
    return path
  },
  'tray:set-icon-path': async (payload: { path: string }) => {
    const ext = extname(payload.path).toLowerCase()
    const rel = join('tray', `${randomUUID()}${ext}`)
    const dest = join(userDataDir(), 'assets', rel)
    await fse.ensureDir(dirname(dest))
    await fse.copy(payload.path, dest, { overwrite: true })
    updateSettings({ tray: { iconPath: rel } })
    refreshTray()
    return rel
  },
  'tray:reset-icon': () => {
    updateSettings({ tray: { iconPath: null } })
    refreshTray()
    return true
  },
  'tray:set-hide-tooltip': (payload: { enabled: boolean }) => {
    updateSettings({ tray: { hideTooltip: Boolean(payload.enabled) } })
    refreshTray()
    return true
  },

  'browser:tabs': () => runtime.tabs?.list() ?? [],
  'browser:active': () => runtime.tabs?.active() ?? null,
  'browser:create-tab': (payload?: { url?: string; activate?: boolean }) =>
    runtime.tabs?.createTab(payload?.url ?? '', payload?.activate ?? true) ?? null,
  'browser:close-tab': (payload: { id: string }) => {
    runtime.tabs?.closeTab(payload.id)
    return true
  },
  'browser:activate-tab': (payload: { id: string }) => {
    runtime.tabs?.setActive(payload.id)
    return true
  },
  'browser:navigate': (payload: { url: string; id?: string }) => runtime.tabs?.navigate(payload.url, payload.id) ?? '',
  'browser:back': () => {
    runtime.tabs?.goBack()
    return true
  },
  'browser:forward': () => {
    runtime.tabs?.goForward()
    return true
  },
  'browser:reload': () => {
    runtime.tabs?.reload()
    return true
  },
  'browser:stop': () => {
    runtime.tabs?.stop()
    return true
  },
  'browser:home': () => {
    runtime.tabs?.home()
    return true
  },
  'browser:set-visible': (payload: { visible: boolean }) => {
    runtime.tabs?.setBrowserVisible(Boolean(payload.visible))
    return true
  },
  'browser:set-zoom': (payload: { zoom: number }) => runtime.tabs?.setZoom(payload.zoom) ?? 100,
  'browser:set-mobile': (payload: { enabled: boolean }) => {
    runtime.tabs?.setMobile(Boolean(payload.enabled))
    return getSettings().browser.mobileMode
  },
  'browser:toggle-compat': (payload?: { id?: string }) => runtime.tabs?.toggleCompat(payload?.id) ?? false,
  'browser:set-video-speed': (payload: { speed: number }) => {
    runtime.tabs?.setVideoSpeed(payload.speed)
    return getSettings().browser.video.speed
  },
  'browser:set-prefs': (payload: Partial<AppSettings['browser']>) => {
    runtime.tabs?.setPrefs(payload)
    return getSettings().browser
  },

  'history:list': () => listHistory(),
  'history:add': (payload: { url: string; title: string }) => {
    addHistory(payload.url, payload.title)
    return listHistory()
  },
  'history:remove': (payload: { id: string }) => {
    removeHistory(payload.id)
    return listHistory()
  },
  'history:clear': () => {
    clearHistory()
    return listHistory()
  },

  'bookmarks:list': () => listBookmarks(),
  'bookmarks:add': (payload: { url: string; title: string }) => addBookmark(payload.url, payload.title),
  'bookmarks:remove': (payload: { id: string }) => removeBookmark(payload.id),
  'bookmarks:remove-url': (payload: { url: string }) => removeBookmarkByUrl(payload.url),
  'bookmarks:has': (payload: { url: string }) => isBookmarked(payload.url),

  'sites:list': () => listSites(),
  'sites:add': (payload: { name: string; url: string; compat?: boolean }) =>
    addSite(payload.name, payload.url, Boolean(payload.compat)),
  'sites:update': (payload: { id: string; patch: { name?: string; url?: string; compat?: boolean } }) =>
    updateSite(payload.id, payload.patch),
  'sites:remove': (payload: { id: string }) => removeSite(payload.id),

  'library:list': () => listBooks(),
  'library:categories': () => listCategories(),
  'library:import-dialog': async () => {
    const win = runtime.win
    const options: Electron.OpenDialogOptions = {
      title: '导入电子书',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '电子书', extensions: ['pdf', 'epub', 'mobi', 'azw3', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  },
  'library:read-file': async (payload: { path: string }) => {
    const filePath = String(payload.path)
    const stat = await fse.stat(filePath)
    if (!stat.isFile()) throw new Error('不是文件')
    if (stat.size > 400 * 1024 * 1024) throw new Error('文件超过 400MB')
    const buffer = await fse.readFile(filePath)
    return { name: basename(filePath), size: stat.size, bytes: new Uint8Array(buffer) }
  },
  'library:upsert': (payload: Parameters<typeof upsertBook>[0]) => upsertBook(payload),
  'library:remove': (payload: { id: string }) => removeBook(payload.id),
  'library:set-progress': (payload: { id: string; progress: number; location: string }) => {
    setProgress(payload.id, payload.progress, payload.location)
    return true
  },
  'library:set-category': (payload: { id: string; categoryId: string | null }) =>
    setBookCategory(payload.id, payload.categoryId),
  'library:add-category': (payload: { name: string }) => addCategory(payload.name),
  'library:rename-category': (payload: { id: string; name: string }) => renameCategory(payload.id, payload.name),
  'library:remove-category': (payload: { id: string }) => removeCategory(payload.id),

  'auth:status': async () => {
    const service = getAuthService()
    try {
      return { enabled: service.enabled, mode: service.mode, session: await service.getSession() }
    } catch {
      return { enabled: service.enabled, mode: service.mode, session: null }
    }
  },

  'debug:browser-state': () => {
    const win = runtime.win
    const views: any[] = win ? ((win.contentView as any).children ?? []) : []
    return views
      .filter((view) => view?.webContents)
      .map((view) => ({
        url: view.webContents.getURL(),
        title: view.webContents.getTitle(),
        zoom: view.webContents.getZoomFactor(),
        ua: view.webContents.getUserAgent(),
        canGoBack:
          typeof view.webContents.navigationHistory?.canGoBack === 'function'
            ? view.webContents.navigationHistory.canGoBack()
            : null,
        canGoForward:
          typeof view.webContents.navigationHistory?.canGoForward === 'function'
            ? view.webContents.navigationHistory.canGoForward()
            : null,
        visible: typeof view.getVisible === 'function' ? view.getVisible() : null,
      }))
  },
  'debug:stealth-state': () => ({
    headerHidden: runtime.headerHidden,
    bodyHidden: runtime.bodyHidden,
    headerRect: runtime.headerRect,
    contentRect: runtime.contentRect,
    overlayOpen: runtime.overlayOpen,
    locked: runtime.locked,
  }),
  'debug:window-state': () => ({
    bounds: runtime.win?.getBounds(),
    alwaysOnTop: runtime.win?.isAlwaysOnTop(),
    opacity: runtime.win?.getOpacity(),
    mini: runtime.miniMode,
    locked: runtime.locked,
    settings: getSettings(),
  }),
  'debug:tray-state': () => ({
    exists: Boolean(runtime.tray),
    destroyed: runtime.tray ? runtime.tray.isDestroyed() : null,
    iconPath: getSettings().tray.iconPath,
    hideTooltip: getSettings().tray.hideTooltip,
  }),
  'debug:trigger-boss': (payload: { action: 'toggle' | 'hide' }) => {
    if (payload.action === 'hide') hideWindow()
    else toggleWindow()
    return true
  },
  'debug:capture-view': async () => {
    const win = runtime.win
    const views: any[] = win ? ((win.contentView as any).children ?? []) : []
    const view = views.filter((item) => item?.webContents).at(-1)
    if (!view) return null
    const image = await view.webContents.capturePage()
    return image.toDataURL()
  },

  'app:quit': () => {
    runtime.quitting = true
    app.quit()
    return true
  },
}

export function registerIpc(): void {
  subscribeSettings((settings) => {
    configureAuth(settings.auth.enabled, settings.auth.mode)
    applyWindowSettings()
    runtime.tabs?.applyPrefs()
    send('settings:changed', settings)
    scheduleSideEffects()
  })

  ipcMain.handle('idlewise:invoke', async (event, channel: string, payload: unknown) => {
    if (event.sender !== runtime.win?.webContents && !isOverlayContents(event.sender.id))
      throw new Error('IPC_FORBIDDEN')
    const handler = handlers[channel]
    if (!handler) throw new Error(`IPC_UNKNOWN:${channel}`)
    try {
      return await handler(payload)
    } catch (err) {
      console.error(`[ipc] ${channel}`, err)
      throw err
    }
  })
}
