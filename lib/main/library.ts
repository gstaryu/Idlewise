import { createHash, randomUUID } from 'crypto'
import type { Book, BookCategory, BookFormat } from '../shared/types'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'

interface LibraryData {
  books: Book[]
  categories: BookCategory[]
}

const file = () => dataFile('library.json')
let cache: LibraryData | null = null

const VALID_FORMATS: BookFormat[] = ['pdf', 'epub', 'mobi', 'azw3', 'txt']

function cleanBooks(raw: unknown): Book[] {
  if (!Array.isArray(raw)) return []
  const out: Book[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    if (typeof b.path !== 'string' || !b.path) continue
    const format = VALID_FORMATS.includes(b.format as BookFormat) ? (b.format as BookFormat) : null
    if (!format) continue
    const id = typeof b.id === 'string' && b.id ? b.id : bookIdFor(b.path)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title: typeof b.title === 'string' && b.title ? b.title : b.path,
      author: typeof b.author === 'string' ? b.author : '',
      path: b.path,
      format,
      categoryId: typeof b.categoryId === 'string' ? b.categoryId : null,
      addedAt: typeof b.addedAt === 'number' && Number.isFinite(b.addedAt) ? b.addedAt : Date.now(),
      lastReadAt: typeof b.lastReadAt === 'number' && Number.isFinite(b.lastReadAt) ? b.lastReadAt : 0,
      progress: Math.min(1, Math.max(0, Number(b.progress) || 0)),
      location: typeof b.location === 'string' ? b.location : '',
      cover: typeof b.cover === 'string' ? b.cover : '',
      size: typeof b.size === 'number' && Number.isFinite(b.size) ? b.size : 0,
    })
  }
  return out
}

function cleanCategories(raw: unknown): BookCategory[] {
  if (!Array.isArray(raw)) return []
  const out: BookCategory[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || seen.has(c.id)) continue
    seen.add(c.id)
    out.push({
      id: c.id,
      name: typeof c.name === 'string' && c.name ? c.name : '新分类',
      createdAt: typeof c.createdAt === 'number' && Number.isFinite(c.createdAt) ? c.createdAt : Date.now(),
    })
  }
  return out
}

function load(): LibraryData {
  if (!cache) {
    const raw = readJson<Partial<LibraryData>>(file(), {})
    const categories = cleanCategories(raw.categories)
    const categoryIds = new Set(categories.map((c) => c.id))
    const books = cleanBooks(raw.books).map((b) =>
      b.categoryId && !categoryIds.has(b.categoryId) ? { ...b, categoryId: null } : b
    )
    cache = { books, categories }
  }
  return cache
}

function save(): void {
  void writeJsonAtomic(file(), cache ?? { books: [], categories: [] })
}

export function bookIdFor(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16)
}

export function listBooks(): Book[] {
  return [...load().books]
}

export function upsertBook(input: Partial<Book> & { path: string; title: string; format: BookFormat }): Book {
  const data = load()
  const id = input.id || bookIdFor(input.path)
  const existing = data.books.find((b) => b.id === id)
  const book: Book = {
    id,
    title: input.title || existing?.title || input.path,
    author: input.author ?? existing?.author ?? '',
    path: input.path,
    format: input.format,
    categoryId: input.categoryId !== undefined ? input.categoryId : (existing?.categoryId ?? null),
    addedAt: existing?.addedAt ?? Date.now(),
    lastReadAt: input.lastReadAt ?? existing?.lastReadAt ?? 0,
    progress: input.progress ?? existing?.progress ?? 0,
    location: input.location ?? existing?.location ?? '',
    cover: input.cover ?? existing?.cover ?? '',
    size: input.size ?? existing?.size ?? 0,
  }
  if (existing) Object.assign(existing, book)
  else data.books.unshift(book)
  save()
  return book
}

export function removeBook(id: string): Book[] {
  const data = load()
  data.books = data.books.filter((b) => b.id !== id)
  save()
  return [...data.books]
}

export function setProgress(id: string, progress: number, location: string): void {
  const book = load().books.find((b) => b.id === id)
  if (!book) return
  book.progress = Math.min(1, Math.max(0, Number(progress) || 0))
  book.location = location || ''
  book.lastReadAt = Date.now()
  save()
}

export function setBookCategory(id: string, categoryId: string | null): Book[] {
  const data = load()
  const book = data.books.find((b) => b.id === id)
  if (book) book.categoryId = categoryId && data.categories.some((c) => c.id === categoryId) ? categoryId : null
  save()
  return [...data.books]
}

export function listCategories(): BookCategory[] {
  return [...load().categories]
}

export function addCategory(name: string): BookCategory {
  const data = load()
  const clean = name.trim() || '新分类'
  const category: BookCategory = { id: randomUUID(), name: clean, createdAt: Date.now() }
  data.categories.push(category)
  save()
  return category
}

export function renameCategory(id: string, name: string): BookCategory[] {
  const data = load()
  const category = data.categories.find((c) => c.id === id)
  if (category) category.name = name.trim() || category.name
  save()
  return [...data.categories]
}

export function removeCategory(id: string): { categories: BookCategory[]; books: Book[] } {
  const data = load()
  data.categories = data.categories.filter((c) => c.id !== id)
  for (const book of data.books) if (book.categoryId === id) book.categoryId = null
  save()
  return { categories: [...data.categories], books: [...data.books] }
}

export function flushLibrary(): void {
  writeJsonSyncAtomic(file(), cache ?? { books: [], categories: [] })
}
