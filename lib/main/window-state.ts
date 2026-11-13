import type { Rectangle } from 'electron'
import fse from 'fs-extra'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const file = () => dataFile('window-state.json')
let paused = false

export function loadWindowState(): WindowState | null {
  const state = readJson<WindowState | null>(file(), null)
  if (!state) return null
  if (typeof state.width !== 'number' || typeof state.height !== 'number') return null
  if (state.width < 320 || state.height < 240) return null
  return state
}

export function pauseWindowStateTracking(value: boolean): void {
  paused = value
}

export function trackWindowState(win: Electron.BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const save = () => {
    if (paused) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        if (win.isDestroyed() || win.isMinimized()) return
        const bounds: Rectangle = win.getNormalBounds()
        void writeJsonAtomic(file(), {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          maximized: win.isMaximized(),
        } satisfies WindowState)
      } catch {
        /* window gone */
      }
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}

export function writeWindowStateSync(win: Electron.BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds()
    fse.ensureDirSync(dataFile('.'))
    writeJsonSyncAtomic(file(), {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
    })
  } catch {
    /* ignore */
  }
}
