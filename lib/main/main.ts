import { app } from 'electron'
import { appendFileSync } from 'fs'
import { join } from 'path'
import { APP_ID } from '../shared/branding'
import { configureAuth } from './auth'
import { registerIpc } from './ipc'
import { lock } from './lock'
import { registerAssetProtocol, registerAssetScheme } from './protocol'
import { flushSettings, getSettings, initSettings } from './settings'
import { runtime } from './state'
import { TabManager } from './tabs'
import { destroyTray } from './tray'
import { unregisterBossKeys } from './bosskey'
import { createMainWindow, revealWindow } from './window'
import { flushHistory } from './history'
import { flushBookmarks } from './bookmarks'
import { flushSites } from './sites'
import { flushLibrary } from './library'
import { writeWindowStateSync } from './window-state'

registerAssetScheme()

// 透明窗口在 Windows 上需要该特性，才能正确处理尺寸与命中区域，避免拖拽/缩放异常。
app.commandLine.appendSwitch('enable-features', 'EnableTransparentHwndEnlargement')

app.setName('Idlewise')

const appData = process.env.IDLEWISE_APPDATA || app.getPath('appData')
const newUserData =
  process.env.IDLEWISE_USERDATA ||
  (app.isPackaged ? join(appData, 'Idlewise') : join(app.getAppPath(), '.idlewise-userdata'))
app.setPath('userData', newUserData)

function logError(tag: string, err: unknown): void {
  try {
    const line = `[${tag}] ${new Date().toISOString()} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
    appendFileSync(join(app.getPath('userData'), 'error.log'), line)
  } catch {
    /* ignore */
  }
  console.error(tag, err)
}

process.on('uncaughtException', (err) => logError('uncaughtException', err))
process.on('unhandledRejection', (err) => logError('unhandledRejection', err))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => revealWindow())

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    registerAssetProtocol()
    initSettings()
    configureAuth(getSettings().auth.enabled, getSettings().auth.mode)

    const win = createMainWindow()
    runtime.tabs = new TabManager(win)
    registerIpc()

    if (getSettings().lock.lockOnStartup && lock.isEnabled()) {
      runtime.locked = true
      runtime.tabs.setLocked(true)
      win.webContents.once('did-finish-load', () => lock.broadcast())
    }
  })

  app.on('before-quit', () => {
    runtime.quitting = true
    flushSettings()
  })

  app.on('will-quit', () => {
    unregisterBossKeys()
    destroyTray()
    runtime.tabs?.destroy()
    flushSettings()
    flushLibrary()
    flushHistory()
    flushBookmarks()
    flushSites()
    if (runtime.win && !runtime.win.isDestroyed()) writeWindowStateSync(runtime.win)
  })

  app.on('window-all-closed', () => {
    /* 常驻托盘：不随窗口关闭退出 */
  })

  app.on('activate', () => revealWindow())
}
