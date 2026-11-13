import { globalShortcut } from 'electron'
import type { BossKeyStatus } from '../shared/types'
import { getSettings } from './settings'
import { runtime } from './state'
import { hideWindow, sendWindowState, toggleWindow } from './window'

let registered: string[] = []
let lastStatus: BossKeyStatus = { ok: true, toggleKey: 'Alt+Z', hideKey: 'Alt+X' }

export function unregisterBossKeys(): void {
  for (const key of registered) {
    try {
      globalShortcut.unregister(key)
    } catch {
      /* ignore */
    }
  }
  registered = []
}

export function applyBossKeys(): BossKeyStatus {
  const s = getSettings()
  unregisterBossKeys()
  const base = { toggleKey: s.bossKey.toggleKey, hideKey: s.bossKey.hideKey }
  if (!s.bossKey.enabled) {
    lastStatus = { ok: true, ...base }
    return lastStatus
  }
  if (!base.toggleKey || !base.hideKey || base.toggleKey === base.hideKey) {
    lastStatus = { ok: false, message: '两个老板键必须不同且不能为空', ...base }
    return lastStatus
  }
  const failures: string[] = []
  try {
    if (!globalShortcut.register(base.toggleKey, () => toggleWindow())) failures.push(base.toggleKey)
    else registered.push(base.toggleKey)
  } catch {
    failures.push(base.toggleKey)
  }
  try {
    if (!globalShortcut.register(base.hideKey, () => hideWindow())) failures.push(base.hideKey)
    else registered.push(base.hideKey)
  } catch {
    failures.push(base.hideKey)
  }
  sendWindowState()
  if (failures.length) {
    lastStatus = { ok: false, message: `快捷键被占用：${failures.join('、')}`, ...base }
    return lastStatus
  }
  lastStatus = { ok: true, ...base }
  return lastStatus
}

export function bossKeyStatus(): BossKeyStatus {
  return lastStatus
}

export function notifyBossKeyStatus(status: BossKeyStatus): void {
  runtime.win?.webContents.send('bosskey:status', status)
}
