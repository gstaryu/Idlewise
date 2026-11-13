import type { BookFormat } from '@/lib/shared/types'
import { decodeText } from '@/lib/shared/text'
import { api } from '../lib/api'

export interface ImportedBook {
  path: string
  title: string
  author: string
  format: BookFormat
  cover: string
  size: number
}

export function formatOf(name: string): BookFormat | null {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'pdf' || ext === 'epub' || ext === 'mobi' || ext === 'azw3' || ext === 'txt') return ext
  return null
}

function firstOf(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  const keys = Object.keys(value)
  return keys.length ? String(value[keys[0]]) : ''
}

function authorOf(value: any): string {
  const one = (x: any) => (typeof x === 'string' ? x : firstOf(x?.name))
  if (Array.isArray(value)) return value.map(one).filter(Boolean).join(', ')
  return one(value)
}

async function blobToCover(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('cover load failed'))
      image.src = url
    })
    const width = 200
    const height = Math.max(120, Math.round((width * image.height) / Math.max(1, image.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function parseFoliate(
  bytes: Uint8Array,
  name: string
): Promise<{ title: string; author: string; cover: string }> {
  await import('foliate-js/view.js')
  const view = document.createElement('foliate-view') as any
  view.style.display = 'none'
  document.body.appendChild(view)
  try {
    const file = new File([bytes as unknown as BlobPart], name)
    await view.open(file)
    const book = view.book
    const meta = book?.metadata ?? {}
    const title = firstOf(meta.title) || name.replace(/\.[^.]+$/, '')
    const author = authorOf(meta.author)
    let cover = ''
    try {
      const blob = await book?.getCover?.()
      if (blob instanceof Blob) cover = await blobToCover(blob)
    } catch {
      cover = ''
    }
    return { title, author, cover }
  } finally {
    try {
      view.close?.()
    } catch {
      /* ignore */
    }
    view.remove()
  }
}

async function parsePdf(bytes: Uint8Array, name: string): Promise<{ title: string; author: string; cover: string }> {
  const pdfjs: any = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: bytes }).promise
  try {
    const meta = await pdf.getMetadata().catch(() => null)
    const info = meta?.info ?? {}
    const rawTitle = String(info.Title || '').trim()
    const title =
      rawTitle && !/^data:/i.test(rawTitle) && rawTitle.length < 200 ? rawTitle : name.replace(/\.pdf$/i, '')
    const author = String(info.Author || '').trim()
    let cover = ''
    try {
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 0.35 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(80, Math.round(viewport.width))
      canvas.height = Math.max(100, Math.round(viewport.height))
      const ctx = canvas.getContext('2d')
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise
        cover = canvas.toDataURL('image/jpeg', 0.8)
      }
    } catch {
      cover = ''
    }
    return { title, author, cover }
  } finally {
    try {
      await pdf.destroy()
    } catch {
      /* ignore */
    }
  }
}

export async function importBookFile(path: string): Promise<ImportedBook> {
  const format = formatOf(path)
  if (!format) throw new Error('不支持的格式')
  const { name, size, bytes } = await api.readFile(path)
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as unknown as ArrayBufferLike)
  const fallbackTitle = name.replace(/\.[^.]+$/, '')

  if (format === 'txt') {
    const head = decodeText(data.slice(0, Math.min(data.length, 256 * 1024)))
    return { path, title: fallbackTitle, author: '', format, cover: '', size: head.length ? size : size }
  }
  if (format === 'pdf') {
    const meta = await parsePdf(data, name)
    return { path, format, size, ...meta }
  }
  const meta = await parseFoliate(data, name)
  return { path, format, size, ...meta }
}

export async function readBookBytes(path: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, bytes } = await api.readFile(path)
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as unknown as ArrayBufferLike)
  return { name, bytes: data }
}
