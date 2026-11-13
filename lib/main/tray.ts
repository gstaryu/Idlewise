import { app, Menu, nativeImage, Tray } from 'electron'
import appIcon from '@/resources/build/icon.png?asset'
import { APP_NAME } from '../shared/branding'
import { getSettings, updateSettings } from './settings'
import { runtime } from './state'
import { absoluteAsset } from './protocol'
import { destroyTray as destroy, setTray } from './tray-state'
import { lock } from './lock'
import { revealWindow, hideWindow } from './window'

function trayImage(iconPath: string | null): Electron.NativeImage {
  const source = iconPath ? absoluteAsset(iconPath) : appIcon
  let image = nativeImage.createFromPath(source)
  if (image.isEmpty()) image = nativeImage.createFromPath(appIcon)
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 })
  return image
}

export function createTray(win: Electron.BrowserWindow): Tray {
  void win
  const s = getSettings()
  const tray = new Tray(trayImage(s.tray.iconPath))
  runtime.tray = tray
  setTray(tray)
  tray.on('click', () => revealWindow())
  refreshTray()
  return tray
}

export function refreshTray(): void {
  const tray = runtime.tray
  if (!tray) return
  const s = getSettings()
  // 更换托盘图标必须立即 setImage，否则旧图标会一直显示到下次启动。
  const image = trayImage(s.tray.iconPath)
  if (!image.isEmpty()) tray.setImage(image)
  tray.setToolTip(s.tray.hideTooltip ? '' : APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 偷闲有道', click: () => revealWindow() },
      { label: '隐藏到托盘', click: () => hideWindow() },
      { type: 'separator' },
      {
        label: '立即锁定',
        enabled: lock.isEnabled(),
        click: () => {
          revealWindow()
          lock.lockNow()
        },
      },
      {
        label: '关闭自动隐藏',
        click: () => {
          updateSettings({ stealth: { headerAutoHide: false, bodyAutoHide: false } })
          revealWindow()
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          runtime.quitting = true
          app.quit()
        },
      },
    ])
  )
}

export function destroyTray(): void {
  destroy()
  runtime.tray = null
}
