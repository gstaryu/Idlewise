import { randomUUID } from 'crypto'
import type { Bookmark } from '../shared/types'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'

const file = () => dataFile('bookmarks.json')
let cache: Bookmark[] | null = null

function load(): Bookmark[] {
  if (!cache) {
    const raw = readJson<Bookmark[]>(file(), [])
    cache = Array.isArray(raw) ? raw.filter((x) => x && typeof x.url === 'string') : []
  }
  return cache
}

function save(): void {
  void writeJsonAtomic(file(), cache ?? [])
}

export function listBookmarks(): Bookmark[] {
  return [...load()]
}

export function addBookmark(url: string, title: string): Bookmark[] {
  if (!/^https?:/i.test(url)) return listBookmarks()
  const list = load()
  if (!list.some((b) => b.url === url)) {
    list.unshift({ id: randomUUID(), url, title: title || url, createdAt: Date.now() })
    save()
  }
  return [...list]
}

export function removeBookmark(id: string): Bookmark[] {
  cache = load().filter((b) => b.id !== id)
  save()
  return [...cache]
}

export function removeBookmarkByUrl(url: string): Bookmark[] {
  cache = load().filter((b) => b.url !== url)
  save()
  return [...cache]
}

export function isBookmarked(url: string): boolean {
  return load().some((b) => b.url === url)
}

export function flushBookmarks(): void {
  writeJsonSyncAtomic(file(), cache ?? [])
}
