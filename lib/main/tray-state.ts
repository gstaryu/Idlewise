import type { Tray } from 'electron'

let trayRef: Tray | null = null

export function setTray(tray: Tray): void {
  trayRef = tray
}

export function getTray(): Tray | null {
  return trayRef
}

export function destroyTray(): void {
  try {
    trayRef?.destroy()
  } catch {
    /* ignore */
  }
  trayRef = null
}
