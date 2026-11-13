import type { BrowserWindow, Rectangle, Tray } from 'electron'
import type { Rect } from '../shared/types'
import type { TabManager } from './tabs'

export const runtime = {
  win: null as BrowserWindow | null,
  tabs: null as TabManager | null,
  tray: null as Tray | null,
  miniMode: false,
  savedBounds: null as Rectangle | null,
  locked: false,
  headerRect: null as Rect | null,
  contentRect: null as Rect | null,
  overlayOpen: false,
  popoverOpen: false,
  headerHidden: false,
  bodyHidden: false,
  quitting: false,
  dragTimer: null as NodeJS.Timeout | null,
}

export type Runtime = typeof runtime
