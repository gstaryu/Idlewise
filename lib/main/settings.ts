import { existsSync, writeFileSync } from 'fs'
import { createDefaultSettings, mergeDeep, sanitizeSettings } from '../shared/settings'
import type { AppSettings } from '../shared/types'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'

let current: AppSettings = createDefaultSettings()
let saveTimer: NodeJS.Timeout | null = null
const listeners = new Set<(settings: AppSettings) => void>()

const file = () => dataFile('settings.json')

export function initSettings(): AppSettings {
  const raw = readJson<any>(file(), {})
  const next = sanitizeSettings(raw)
  // 旧版本默认背景是纯色 #f7f5f0；新版本默认透明。迁移旧默认值，避免升级后
  // 透明度仍被一层米色底“变白”。用户显式改过的颜色/图片不受影响。
  const rawBg = raw?.window?.background
  if (rawBg?.type === 'color' && rawBg.color === '#f7f5f0' && !rawBg.imagePath) {
    next.window.background.type = 'transparent'
    writeJsonSyncAtomic(file(), next)
  }
  // 旧版本“透明模式”只透明应用壳层；升级后一次性把网页透明也打开。
  const marker = dataFile('web-transparent-v2.migrated')
  if (!existsSync(marker)) {
    if (next.window.renderMode === 'transparent') next.browser.webTransparent = true
    try {
      writeFileSync(marker, new Date().toISOString())
    } catch {
      /* ignore */
    }
    writeJsonSyncAtomic(file(), next)
  }
  current = next
  return current
}

export function getSettings(): AppSettings {
  return current
}

export function subscribeSettings(listener: (settings: AppSettings) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void writeJsonAtomic(file(), current)
  }, 150)
}

export function updateSettings(patch: unknown): AppSettings {
  current = sanitizeSettings(mergeDeep(current, patch))
  scheduleSave()
  for (const listener of listeners) {
    try {
      listener(current)
    } catch (err) {
      console.error('[settings] listener failed', err)
    }
  }
  return current
}

export function resetSettings(): AppSettings {
  current = createDefaultSettings()
  scheduleSave()
  for (const listener of listeners) listener(current)
  return current
}

export function flushSettings(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 退出/重启路径必须同步落盘：app.exit() 不会等待异步写在事件循环中完成。
  writeJsonSyncAtomic(file(), current)
}
