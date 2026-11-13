import { randomUUID } from 'crypto'
import type { HistoryEntry } from '../shared/types'
import { hostOf } from '../shared/utils'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'

const file = () => dataFile('history.json')
let cache: HistoryEntry[] | null = null

function load(): HistoryEntry[] {
  if (!cache) {
    const raw = readJson<HistoryEntry[]>(file(), [])
    cache = Array.isArray(raw)
      ? raw
          .filter((x) => x && typeof x.url === 'string')
          .map((entry) => {
            const title = String(entry.title || '').trim()
            if (!title || title === '加载中…') return { ...entry, title: hostOf(entry.url) || entry.url }
            return entry
          })
      : []
  }
  return cache
}

function save(): void {
  void writeJsonAtomic(file(), cache ?? [])
}

export function listHistory(): HistoryEntry[] {
  return [...load()]
}

export function addHistory(url: string, title: string): void {
  if (!/^https?:/i.test(url)) return
  const list = load()
  const last = list[0]
  if (last && last.url === url && Date.now() - last.visitedAt < 60_000) {
    last.title = title || last.title
    last.visitedAt = Date.now()
    save()
    return
  }
  list.unshift({ id: randomUUID(), url, title: title || url, visitedAt: Date.now() })
  if (list.length > 1000) list.length = 1000
  save()
}

export function removeHistory(id: string): void {
  const list = load()
  cache = list.filter((x) => x.id !== id)
  save()
}

export function clearHistory(): void {
  cache = []
  save()
}

export function flushHistory(): void {
  writeJsonSyncAtomic(file(), cache ?? [])
}
