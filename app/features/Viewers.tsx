import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Book, ReaderPrefs } from '@/lib/shared/types'
import { decodeText, escapeHtml, findTextMatches, parseChapters, stripBlankLines } from '@/lib/shared/text'
import { readBookBytes } from './import'

export interface TocItem {
  label: string
  location: string
  subitems?: TocItem[]
}

export interface SearchResult {
  label?: string
  location: string
  excerpt?: { pre: string; match: string; post: string } | string
}

export interface ViewerHandle {
  prev(): void
  next(): void
  goTo(location: string | number): void
  goToFraction(fraction: number): void
  search(query: string): Promise<SearchResult[]>
  clearSearch(): void
  autoScroll(pixels: number): void
  zoomIn?(): void
  zoomOut?(): void
  resetZoom?(): void
}

export interface ViewerProps {
  book: Book
  prefs: ReaderPrefs
  initialLocation: string
  onProgress: (fraction: number, location: string) => void
  onToc: (items: TocItem[]) => void
  onMeta?: (meta: { title?: string; author?: string }) => void
}

function readerCss(prefs: ReaderPrefs): string {
  const family = prefs.fontFamily
    ? `html, body, p, li, blockquote, dd, div, span { font-family: ${prefs.fontFamily} !important; }`
    : ''
  const bgAlpha = Math.max(0, 100 - prefs.backgroundTransparency)
  const background = `color-mix(in srgb, ${prefs.backgroundColor} ${bgAlpha}%, transparent)`
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color-scheme: ${isDark(prefs.backgroundColor) ? 'dark' : 'light'}; background: ${background}; color: ${prefs.textColor}; font-size: ${prefs.fontSize}px; }
    body { background: ${background}; color: ${prefs.textColor}; }
    a:link, a:visited { color: ${isDark(prefs.backgroundColor) ? '#7fc2a9' : '#2f6f5e'}; }
    p, li, blockquote, dd, div { line-height: ${prefs.lineHeight}; }
    pre { white-space: pre-wrap !important; }
    mark { background: #f3d27a; color: #1f1d18; }
    ${family}
  `
}

export function isDark(color: string): boolean {
  const hex = color.trim().replace('#', '')
  if (hex.length < 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return false
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
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

/* ----------------------------- EPUB / MOBI / AZW3 ----------------------------- */

function mapToc(items: any[]): TocItem[] {
  return (items ?? []).map((item) => ({
    label: item.label,
    location: item.href,
    subitems: item.subitems?.length ? mapToc(item.subitems) : undefined,
  }))
}

export const FoliateViewer = forwardRef<ViewerHandle, ViewerProps>(function FoliateViewer(props, ref) {
  const { book, prefs, initialLocation, onProgress, onToc, onMeta } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    prev: () => viewRef.current?.goLeft(),
    next: () => viewRef.current?.goRight(),
    goTo: (location) => void viewRef.current?.goTo?.(String(location)),
    goToFraction: (fraction) => void viewRef.current?.goToFraction?.(fraction),
    search: async (query: string) => {
      const view = viewRef.current
      if (!view) return []
      const results: SearchResult[] = []
      try {
        view.clearSearch?.()
        for await (const item of view.search({ query })) {
          if (item === 'done') break
          if (item?.subitems) {
            for (const sub of item.subitems) {
              results.push({ label: item.label, location: sub.cfi, excerpt: sub.excerpt })
            }
          } else if (item?.cfi) {
            results.push({ location: item.cfi, excerpt: item.excerpt })
          }
        }
      } catch (err) {
        console.error('[foliate] search failed', err)
      }
      return results
    },
    clearSearch: () => viewRef.current?.clearSearch?.(),
    autoScroll: (pixels) => viewRef.current?.renderer?.scrollBy?.(0, pixels),
  }))

  useEffect(() => {
    let cancelled = false
    let view: any
    const container = containerRef.current
    void (async () => {
      await import('foliate-js/view.js')
      const { name, bytes } = await readBookBytes(book.path)
      if (cancelled || !container) return
      const file = new File([bytes as unknown as BlobPart], name)
      view = document.createElement('foliate-view') as any
      viewRef.current = view
      container.innerHTML = ''
      container.appendChild(view)
      // 让自定义元素先完成一次布局，避免 foliate 在容器尚未就绪时读取空节点样式。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      view.addEventListener('relocate', (event: any) => {
        const detail = event.detail ?? {}
        onProgress(detail.fraction ?? 0, detail.cfi ?? '')
      })
      await view.open(file)
      view.renderer?.setStyles?.(readerCss(prefs))
      view.renderer?.setAttribute?.('flow', prefs.flow)
      let restored = false
      if (initialLocation) {
        try {
          await view.goTo(initialLocation)
          restored = true
        } catch {
          restored = false
        }
      }
      if (!restored) view.renderer?.next?.()
      const opened = view.book
      const meta = opened?.metadata ?? {}
      onMeta?.({ title: firstOf(meta.title) || undefined, author: authorOf(meta.author) || undefined })
      onToc?.(mapToc(opened?.toc ?? []))
    })().catch((err) => console.error('[foliate] open failed', err))
    return () => {
      cancelled = true
      try {
        view?.close?.()
      } catch {
        /* ignore */
      }
      if (container) container.innerHTML = ''
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.path])

  useEffect(() => {
    viewRef.current?.renderer?.setStyles?.(readerCss(prefs))
    viewRef.current?.renderer?.setAttribute?.('flow', prefs.flow)
  }, [prefs])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
})

/* ----------------------------------- PDF ----------------------------------- */

export const PdfViewer = forwardRef<ViewerHandle, ViewerProps>(function PdfViewer(props, ref) {
  const { book, prefs, initialLocation, onProgress, onToc } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)
  const numRef = useRef(1)
  const canvasesRef = useRef<HTMLCanvasElement[]>([])
  const baseRef = useRef<{ w: number; h: number }[]>([])
  const renderedRef = useRef<Set<number>>(new Set())
  const zoomRef = useRef(1)
  const pageRef = useRef(1)
  const paginatedRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const fitScale = () => {
    const wrap = wrapRef.current
    const base = baseRef.current[0]
    if (!wrap || !base) return 1
    const widthScale = (wrap.clientWidth - 32) / base.w
    if (paginatedRef.current) {
      const heightScale = (wrap.clientHeight - 24) / base.h
      return Math.max(0.1, Math.min(widthScale, heightScale)) * zoomRef.current
    }
    return Math.max(0.25, widthScale) * zoomRef.current
  }

  const renderPage = async (index: number) => {
    const pdf = pdfRef.current
    const canvas = canvasesRef.current[index]
    if (!pdf || !canvas || renderedRef.current.has(index)) return
    if (paginatedRef.current && index !== pageRef.current - 1) return
    renderedRef.current.add(index)
    try {
      const page = await pdf.getPage(index + 1)
      const viewport = page.getViewport({ scale: fitScale() })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(viewport.width * dpr))
      canvas.height = Math.max(1, Math.round(viewport.height * dpr))
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch {
      renderedRef.current.delete(index)
    }
  }

  const relayout = () => {
    const wrap = wrapRef.current
    if (!wrap || !baseRef.current.length) return
    const scale = fitScale()
    canvasesRef.current.forEach((canvas, index) => {
      const base = baseRef.current[index]
      if (!base) return
      canvas.style.width = `${base.w * scale}px`
      canvas.style.height = `${base.h * scale}px`
    })
    renderedRef.current.clear()
    if (paginatedRef.current) {
      void renderPage(pageRef.current - 1)
      return
    }
    const height = wrap.clientHeight
    canvasesRef.current.forEach((canvas, index) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < height + 800) void renderPage(index)
    })
  }

  const currentPage = () => {
    if (paginatedRef.current) return pageRef.current
    const wrap = wrapRef.current
    if (!wrap) return 1
    let current = 0
    canvasesRef.current.forEach((canvas, index) => {
      if (canvas.offsetTop - wrap.scrollTop <= 60) current = index
    })
    return current + 1
  }

  const scrollToPage = (page: number) => {
    const index = Math.min(Math.max(1, page), numRef.current) - 1
    pageRef.current = index + 1
    if (paginatedRef.current) {
      canvasesRef.current.forEach((canvas, i) => canvas.classList.toggle('page-active', i === index))
      void renderPage(index)
      if (numRef.current) onProgress((index + 1) / numRef.current, `${index + 1}/${numRef.current}`)
      return
    }
    canvasesRef.current[index]?.scrollIntoView({ block: 'start' })
  }

  const setZoom = (zoom: number) => {
    zoomRef.current = Math.min(3, Math.max(0.3, zoom))
    relayout()
  }

  useImperativeHandle(ref, () => ({
    prev: () => scrollToPage(currentPage() - 1),
    next: () => scrollToPage(currentPage() + 1),
    goTo: (location) => {
      const page = typeof location === 'number' ? location : parseInt(String(location).split('/')[0], 10) || 1
      scrollToPage(page)
    },
    goToFraction: (fraction) => scrollToPage(Math.round(fraction * numRef.current) || 1),
    search: async (query: string) => {
      const pdf = pdfRef.current
      const results: SearchResult[] = []
      if (!pdf || !query.trim()) return results
      for (let pageNo = 1; pageNo <= numRef.current && results.length < 200; pageNo++) {
        try {
          const page = await pdf.getPage(pageNo)
          const content = await page.getTextContent()
          const text = content.items.map((item: any) => item.str).join(' ')
          const matches = findTextMatches(text, query, 20)
          for (const match of matches) {
            results.push({ label: `第 ${pageNo} 页`, location: String(pageNo), excerpt: match.preview })
          }
        } catch {
          /* ignore page */
        }
      }
      return results
    },
    clearSearch: () => undefined,
    autoScroll: (pixels) => {
      if (paginatedRef.current) return
      wrapRef.current?.scrollBy({ top: pixels, behavior: 'auto' })
    },
    zoomIn: () => setZoom(zoomRef.current * 1.15),
    zoomOut: () => setZoom(zoomRef.current / 1.15),
    resetZoom: () => setZoom(1),
  }))

  useEffect(() => {
    let cancelled = false
    const wrap = wrapRef.current
    paginatedRef.current = prefs.flow === 'paginated'
    void (async () => {
      const pdfjs: any = await import('pdfjs-dist')
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = worker
      const { bytes } = await readBookBytes(book.path)
      const pdf = await pdfjs.getDocument({ data: bytes }).promise
      if (cancelled) {
        void pdf.destroy()
        return
      }
      pdfRef.current = pdf
      numRef.current = pdf.numPages
      if (!wrap) return
      wrap.innerHTML = ''
      wrap.classList.toggle('pdf-paginated', paginatedRef.current)
      canvasesRef.current = []
      baseRef.current = []
      renderedRef.current = new Set()
      for (let index = 0; index < pdf.numPages; index++) {
        const page = await pdf.getPage(index + 1)
        const viewport = page.getViewport({ scale: 1 })
        baseRef.current.push({ w: viewport.width, h: viewport.height })
        const canvas = document.createElement('canvas')
        canvas.className = 'pdf-page'
        wrap.appendChild(canvas)
        canvasesRef.current.push(canvas)
      }
      const scale = fitScale()
      canvasesRef.current.forEach((canvas, index) => {
        const base = baseRef.current[index]
        canvas.style.width = `${base.w * scale}px`
        canvas.style.height = `${base.h * scale}px`
      })
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const index = canvasesRef.current.indexOf(entry.target as HTMLCanvasElement)
              if (index >= 0) void renderPage(index)
            }
          }
        },
        { root: wrap, rootMargin: '800px 0px' }
      )
      canvasesRef.current.forEach((canvas) => observerRef.current?.observe(canvas))
      const startPage = Math.min(Math.max(1, parseInt(initialLocation) || 1), pdf.numPages)
      pageRef.current = startPage
      onProgress(startPage / pdf.numPages, `${startPage}/${pdf.numPages}`)
      if (paginatedRef.current) {
        canvasesRef.current.forEach((canvas, index) => canvas.classList.toggle('page-active', index === startPage - 1))
        void renderPage(startPage - 1)
      } else if (startPage > 1) {
        canvasesRef.current[startPage - 1]?.scrollIntoView()
      } else {
        void renderPage(0)
        void renderPage(1)
      }
      const onScroll = () => {
        const page = currentPage()
        onProgress(pdf.numPages ? page / pdf.numPages : 0, `${page}/${pdf.numPages}`)
      }
      wrap.addEventListener('scroll', onScroll, { passive: true })
      let resizeTimer: ReturnType<typeof setTimeout> | undefined
      const observer = new ResizeObserver(() => {
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(relayout, 200)
      })
      observer.observe(wrap)
      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey) {
          event.preventDefault()
          setZoom(zoomRef.current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))
        }
      }
      wrap.addEventListener('wheel', onWheel, { passive: false })

      try {
        const outline = await pdf.getOutline()
        const flatten = async (items: any[], depth = 0): Promise<TocItem[]> => {
          const out: TocItem[] = []
          for (const item of items ?? []) {
            let page = 1
            try {
              const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
              if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0])) + 1
            } catch {
              page = 1
            }
            out.push({
              label: item.title || '未命名',
              location: String(page),
              subitems: item.items?.length ? await flatten(item.items, depth + 1) : undefined,
            })
          }
          return out
        }
        onToc(await flatten(outline ?? []))
      } catch {
        onToc([])
      }

      ;(wrap as any)._cleanup = () => {
        wrap.removeEventListener('scroll', onScroll)
        wrap.removeEventListener('wheel', onWheel)
        observerRef.current?.disconnect()
        observer.disconnect()
        clearTimeout(resizeTimer)
      }
    })().catch((err) => console.error('[pdf] open failed', err))
    return () => {
      cancelled = true
      try {
        ;(wrap as any)?._cleanup?.()
      } catch {
        /* ignore */
      }
      try {
        pdfRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      pdfRef.current = null
      canvasesRef.current.forEach((canvas) => {
        canvas.width = 0
        canvas.height = 0
      })
      canvasesRef.current = []
      baseRef.current = []
      renderedRef.current.clear()
      if (wrap) wrap.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.path])

  useEffect(() => {
    const next = prefs.flow === 'paginated'
    const previous = currentPage()
    paginatedRef.current = next
    const wrap = wrapRef.current
    if (wrap) wrap.classList.toggle('pdf-paginated', next)
    if (!canvasesRef.current.length) return
    scrollToPage(previous)
    if (!next) {
      canvasesRef.current.forEach((canvas) => canvas.classList.remove('page-active'))
      relayout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.flow])

  return (
    <div
      ref={wrapRef}
      className={`pdf-scroll${prefs.flow === 'paginated' ? ' pdf-paginated' : ''}`}
      style={{
        background: `color-mix(in srgb, ${prefs.backgroundColor} ${Math.max(0, 100 - prefs.backgroundTransparency)}%, transparent)`,
      }}
    >
      <style>{`.pdf-page{display:block;margin:10px auto;box-shadow:0 8px 24px rgba(0,0,0,.16);${
        isDark(prefs.backgroundColor) ? 'filter:invert(1) hue-rotate(180deg);' : ''
      }}`}</style>
    </div>
  )
})

/* ----------------------------------- TXT ----------------------------------- */

function highlightHtml(text: string, query: string): string {
  const escaped = escapeHtml(text)
  const q = query.trim()
  if (!q) return escaped
  const escapedQuery = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return escaped.replace(new RegExp(escapedQuery, 'gi'), (match) => `<mark>${match}</mark>`)
  } catch {
    return escaped
  }
}

export const TxtViewer = forwardRef<ViewerHandle, ViewerProps>(function TxtViewer(props, ref) {
  const { book, prefs, initialLocation, onProgress, onToc } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<(HTMLElement | null)[]>([])
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [focusChapter, setFocusChapter] = useState<number | null>(null)

  const chapters = useMemo(() => {
    if (!text) return []
    const normalized = prefs.stripBlankLines ? stripBlankLines(text) : text
    return parseChapters(normalized)
  }, [text, prefs.stripBlankLines])

  useImperativeHandle(ref, () => ({
    prev: () => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    next: () => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.9, behavior: 'smooth' }),
    goTo: (location) => {
      const value = String(location)
      if (value.startsWith('ch-')) {
        const index = Number(value.slice(3))
        chapterRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setFocusChapter(index)
        return
      }
      if (value.includes(':')) {
        const [chapter, offset] = value.split(':').map(Number)
        setFocusChapter(chapter)
        const el = scrollRef.current
        const chapterEl = chapterRefs.current[chapter]
        if (el && chapterEl) {
          const body = chapters[chapter]?.body ?? ''
          const ratio = body.length ? (offset || 0) / body.length : 0
          el.scrollTop = Math.max(0, chapterEl.offsetTop + ratio * chapterEl.offsetHeight - 40)
        }
        return
      }
      const fraction = parseFloat(value) || 0
      const el = scrollRef.current
      if (el) el.scrollTop = fraction * (el.scrollHeight - el.clientHeight)
    },
    goToFraction: (fraction) => {
      const el = scrollRef.current
      if (el) el.scrollTop = fraction * (el.scrollHeight - el.clientHeight)
    },
    search: async (q: string) => {
      setQuery(q)
      const results: SearchResult[] = []
      if (!q.trim()) return results
      chapters.forEach((chapter, index) => {
        for (const match of findTextMatches(chapter.body, q, 30)) {
          results.push({
            label: chapter.title,
            location: `${index}:${match.index}`,
            excerpt: match.preview,
          })
        }
      })
      return results.slice(0, 200)
    },
    clearSearch: () => {
      setQuery('')
      setFocusChapter(null)
    },
    autoScroll: (pixels) => {
      if (prefs.flow === 'paginated') return
      scrollRef.current?.scrollBy({ top: pixels, behavior: 'auto' })
    },
  }))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { bytes } = await readBookBytes(book.path)
      if (!cancelled) setText(decodeText(bytes))
    })().catch((err) => console.error('[txt] open failed', err))
    return () => {
      cancelled = true
    }
  }, [book.path])

  useEffect(() => {
    if (!chapters.length) return
    onToc(
      chapters.length > 1 ? chapters.map((chapter, index) => ({ label: chapter.title, location: `ch-${index}` })) : []
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !text) return
    const fraction = parseFloat(initialLocation) || 0
    requestAnimationFrame(() => {
      el.scrollTop = fraction * (el.scrollHeight - el.clientHeight)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const denominator = el.scrollHeight - el.clientHeight
    const fraction = denominator > 0 ? el.scrollTop / denominator : 0
    onProgress(fraction, String(fraction))
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`txt-scroll${prefs.flow === 'paginated' ? ' txt-paginated' : ''}`}
      style={{
        background: `color-mix(in srgb, ${prefs.backgroundColor} ${Math.max(0, 100 - prefs.backgroundTransparency)}%, transparent)`,
        color: prefs.textColor,
      }}
    >
      <div
        className="txt-body"
        style={{
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
          fontFamily: prefs.fontFamily || undefined,
        }}
      >
        {chapters.map((chapter, index) => (
          <section
            key={index}
            ref={(el) => {
              chapterRefs.current[index] = el
            }}
          >
            {chapters.length > 1 && <h2 className="txt-chapter">{chapter.title}</h2>}
            <div
              className="txt-text"
              dangerouslySetInnerHTML={{ __html: highlightHtml(chapter.body, focusChapter === index ? query : '') }}
            />
          </section>
        ))}
      </div>
    </div>
  )
})
