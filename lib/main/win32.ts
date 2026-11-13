import koffi from 'koffi'
import type { BrowserWindow } from 'electron'

const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_APPWINDOW = 0x00040000

let user32: any = null
let getStyle: ((hwnd: bigint, index: number) => any) | null = null
let setStyle: ((hwnd: bigint, index: number, value: bigint) => any) | null = null

function ensureApi(): boolean {
  if (process.platform !== 'win32') return false
  if (!user32) {
    try {
      user32 = koffi.load('user32.dll')
    } catch {
      return false
    }
  }
  if (!getStyle || !setStyle) {
    try {
      getStyle = user32.func('int64 GetWindowLongPtrW(uint64 hWnd, int nIndex)')
      setStyle = user32.func('int64 SetWindowLongPtrW(uint64 hWnd, int nIndex, int64 dwNewLong)')
    } catch {
      return false
    }
  }
  return true
}

let applied: boolean | null = null

/**
 * 隐藏任务栏图标时同时设置 WS_EX_TOOLWINDOW；仅 setSkipTaskbar 在 Windows 上
 * 只移除任务栏按钮，窗口仍会出现在 Alt+Tab。恢复时移除该扩展样式。
 */
export function setTaskbarHidden(win: BrowserWindow, hidden: boolean): void {
  if (applied === hidden) return
  applied = hidden
  if (!ensureApi()) {
    try {
      win.setSkipTaskbar(hidden)
    } catch {
      /* ignore */
    }
    return
  }
  try {
    const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0)
    const current = Number(getStyle!(hwnd, GWL_EXSTYLE))
    const next = hidden ? (current | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW : current & ~WS_EX_TOOLWINDOW
    setStyle!(hwnd, GWL_EXSTYLE, BigInt(next))
    win.setSkipTaskbar(hidden)
    // 让 Windows 重新计算 Alt+Tab 列表；只在可见时刷新，避免隐藏状态被意外 show。
    if (win.isVisible()) {
      win.hide()
      win.show()
    }
  } catch {
    try {
      win.setSkipTaskbar(hidden)
    } catch {
      /* ignore */
    }
  }
}
