import { screen } from 'electron'
import type { Rect } from '../shared/types'
import { getSettings } from './settings'
import { runtime } from './state'

let timer: NodeJS.Timeout | null = null
let graceUntil = 0
let headerGraceUntil = 0
let bodyGraceUntil = 0

const inRect = (p: { x: number; y: number }, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

function contentBounds(): Rect | null {
  const win = runtime.win
  if (!win || win.isDestroyed()) return null
  const b = win.getContentBounds()
  return { x: b.x, y: b.y, width: b.width, height: b.height }
}

function headerScreenRect(): Rect | null {
  const win = runtime.win
  const rel = runtime.headerRect
  if (!win || !rel) return null
  const b = win.getContentBounds()
  return { x: b.x + rel.x, y: b.y + rel.y, width: rel.width, height: rel.height }
}

function emit(channel: string, value: boolean) {
  runtime.win?.webContents.send(channel, value)
}

/**
 * 主体隐藏时窗口内容不可见，必须同时让鼠标事件穿透，否则一块看不见的窗口会
 * 吞掉下方应用的点击。指针回到窗口内时 tick()/showBody() 会立即恢复。
 * header 与 body 相互独立：指针在窗口外时两者都不可用，指针进入窗口即恢复主体。
 */
function applyClickThrough(): void {
  const win = runtime.win
  if (!win || win.isDestroyed()) return
  try {
    win.setIgnoreMouseEvents(runtime.bodyHidden, { forward: true })
  } catch {
    /* ignore */
  }
}

export function hideBody(force = false): void {
  if (runtime.bodyHidden) return
  if (!force && Date.now() < bodyGraceUntil) return
  if (runtime.locked || runtime.overlayOpen) return
  runtime.bodyHidden = true
  applyClickThrough()
  runtime.tabs?.setBodyHidden(true)
  emit('stealth:body', false)
}

export function showBody(): void {
  if (!runtime.bodyHidden && runtime.headerHidden === false) {
    applyClickThrough()
    runtime.tabs?.setBodyHidden(false)
    emit('stealth:body', true)
    return
  }
  runtime.bodyHidden = false
  applyClickThrough()
  runtime.tabs?.setBodyHidden(false)
  emit('stealth:body', true)
  bodyGraceUntil = Date.now() + 500
}

export function hideHeader(force = false): void {
  if (runtime.headerHidden) return
  if (!force && Date.now() < headerGraceUntil) return
  if (runtime.locked || runtime.overlayOpen) return
  runtime.headerHidden = true
  emit('stealth:header', false)
}

export function showHeader(): void {
  runtime.headerHidden = false
  if (runtime.bodyHidden) showBody()
  emit('stealth:header', true)
  headerGraceUntil = Date.now() + 300
}

export function resetAutoHide(): void {
  showBody()
  showHeader()
  graceUntil = Date.now() + 300
  bodyGraceUntil = graceUntil
  headerGraceUntil = graceUntil
}

export function setPopoverOpen(open: boolean): void {
  runtime.popoverOpen = open
}

export function setOverlayOpen(open: boolean): void {
  runtime.overlayOpen = open
  if (open) {
    showBody()
    showHeader()
  }
}

export function startAutoHide(): void {
  if (timer) return
  timer = setInterval(tick, 40)
}

export function stopAutoHide(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function tick(): void {
  const win = runtime.win
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return
  const settings = getSettings()
  if (runtime.locked || runtime.overlayOpen || runtime.popoverOpen) {
    showBody()
    showHeader()
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const content = contentBounds()
  if (!content) return
  const inside = inRect(cursor, content)

  if (settings.stealth.bodyAutoHide && Date.now() > graceUntil) {
    if (!inside) hideBody()
    else if (runtime.bodyHidden) showBody()
  } else if (runtime.bodyHidden) {
    showBody()
  }

  if (settings.stealth.headerAutoHide && Date.now() > graceUntil) {
    if (runtime.headerHidden) {
      const reveal: Rect = { x: content.x, y: content.y, width: content.width, height: 64 }
      if (inRect(cursor, reveal)) showHeader()
    } else {
      const header = headerScreenRect()
      if (header && !inRect(cursor, header)) hideHeader()
    }
  } else if (runtime.headerHidden) {
    showHeader()
  }
}
