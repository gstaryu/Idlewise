import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FolderPlus,
  Layers,
  ListTree,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import type { Book, BookCategory, ReaderPrefs } from '@/lib/shared/types'
import { formatBytes, formatDate } from '@/lib/shared/utils'
import { cn } from '@/app/lib/cn'
import { useAppStore, useReaderStore } from '@/app/store'
import { ColorField, IconButton, Modal, Popover, Segmented, Slider, Switch, TextInput } from '@/app/components/ui'
import { FoliateViewer, PdfViewer, TxtViewer, type SearchResult, type TocItem, type ViewerHandle } from './Viewers'

const FONT_OPTIONS = [
  { label: '系统', value: '' },
  { label: '宋体', value: 'SimSun, Songti SC, serif' },
  { label: '黑体', value: 'SimHei, Heiti SC, sans-serif' },
  { label: '楷体', value: 'KaiTi, Kaiti SC, serif' },
  { label: '雅黑', value: 'Microsoft YaHei, PingFang SC, sans-serif' },
  { label: '等宽', value: 'Consolas, monospace' },
]

const FORMAT_COLORS: Record<string, string> = {
  pdf: '#c2543f',
  epub: '#2f6e5f',
  mobi: '#b9852f',
  azw3: '#b9852f',
  txt: '#4f6f95',
}

export default function ReaderView({ compact }: { compact: boolean }) {
  const currentId = useReaderStore((s) => s.currentId)
  const books = useReaderStore((s) => s.books)
  const current = books.find((b) => b.id === currentId) ?? null
  if (current) return <Reading book={current} />
  return <Bookshelf compact={compact} />
}

function Bookshelf({ compact }: { compact: boolean }) {
  const books = useReaderStore((s) => s.books)
  const categories = useReaderStore((s) => s.categories)
  const query = useReaderStore((s) => s.query)
  const categoryFilter = useReaderStore((s) => s.categoryFilter)
  const importing = useReaderStore((s) => s.importing)
  const setQuery = useReaderStore((s) => s.setQuery)
  const setCategoryFilter = useReaderStore((s) => s.setCategoryFilter)
  const importBooks = useReaderStore((s) => s.importBooks)
  const open = useReaderStore((s) => s.open)
  const remove = useReaderStore((s) => s.remove)
  const setCategory = useReaderStore((s) => s.setCategory)
  const addCategory = useReaderStore((s) => s.addCategory)
  const renameCategory = useReaderStore((s) => s.renameCategory)
  const removeCategory = useReaderStore((s) => s.removeCategory)

  const [managerOpen, setManagerOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return books
      .filter((book) => {
        if (categoryFilter === null) return true
        if (categoryFilter === 'uncategorized') return !book.categoryId
        return book.categoryId === categoryFilter
      })
      .filter((book) => !q || book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q))
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
  }, [books, categoryFilter, query])

  const continueBook = useMemo(
    () => [...books].sort((a, b) => b.lastReadAt - a.lastReadAt).find((book) => book.progress > 0),
    [books]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shelf-header">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="shelf-title">我的书架</h1>
          {importing && <span className="text-[11px] text-muted-foreground">导入中…</span>}
        </div>
        <div className="shelf-search">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书名 / 作者"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void importBooks()} disabled={importing}>
          <Plus className="size-4" /> 导入
        </button>
      </div>

      <div className="category-bar">
        <button
          type="button"
          className={cn('category-chip', categoryFilter === null && 'active')}
          onClick={() => setCategoryFilter(null)}
        >
          全部 · {books.length}
        </button>
        <button
          type="button"
          className={cn('category-chip', categoryFilter === 'uncategorized' && 'active')}
          onClick={() => setCategoryFilter('uncategorized')}
        >
          未分类
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={cn('category-chip', categoryFilter === category.id && 'active')}
            onClick={() => setCategoryFilter(category.id)}
          >
            {category.name}
          </button>
        ))}
        <button type="button" className="category-chip" onClick={() => setManagerOpen(true)}>
          <Layers className="size-3" /> 管理分类
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <BookOpen className="size-12 opacity-25" />
            <p className="text-sm">书架空空如也</p>
            <button type="button" className="btn-secondary" onClick={() => void importBooks()}>
              导入 PDF / EPUB / MOBI / AZW3 / TXT
            </button>
          </div>
        ) : (
          <>
            {continueBook && categoryFilter === null && !query.trim() && (
              <button type="button" className="continue-card" onClick={() => open(continueBook.id)}>
                <BookCover book={continueBook} size="lg" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] text-muted-foreground">继续阅读</p>
                  <p className="truncate text-sm font-semibold">{continueBook.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{continueBook.author || '未知作者'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.round(continueBook.progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(continueBook.progress * 100)}%
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            )}

            <div className={cn('book-grid', compact && 'book-grid-compact')}>
              {filtered.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  categories={categories}
                  onOpen={() => open(book.id)}
                  onRemove={() => void remove(book.id)}
                  onCategory={(categoryId) => void setCategory(book.id, categoryId)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={managerOpen} onClose={() => setManagerOpen(false)} title="管理书架分类">
        <div className="space-y-3">
          <div className="flex gap-2">
            <TextInput
              value={newCategory}
              onChange={setNewCategory}
              placeholder="新分类名称"
              onEnter={() => {
                if (!newCategory.trim()) return
                void addCategory(newCategory.trim())
                setNewCategory('')
              }}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              onClick={() => {
                if (!newCategory.trim()) return
                void addCategory(newCategory.trim())
                setNewCategory('')
              }}
            >
              <FolderPlus className="size-4" /> 新建
            </button>
          </div>
          {categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有分类。新建后可在书籍菜单里归档。</p>
          ) : (
            <div className="space-y-1.5">
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onRename={(name) => void renameCategory(category.id, name)}
                  onRemove={() => void removeCategory(category.id)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function BookCover({ book, size }: { book: Book; size: 'md' | 'lg' }) {
  const color = FORMAT_COLORS[book.format] ?? '#666'
  return (
    <div
      className={cn('book-cover', size === 'lg' ? 'book-cover-lg' : 'book-cover-md')}
      style={{ background: book.cover ? undefined : color }}
    >
      {book.cover ? (
        <img src={book.cover} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-white">
          <BookOpen className="size-5 opacity-80" />
          <span className="line-clamp-3 text-center text-[10px] leading-tight font-medium">{book.title}</span>
        </div>
      )}
    </div>
  )
}

function BookCard({
  book,
  categories,
  onOpen,
  onRemove,
  onCategory,
}: {
  book: Book
  categories: BookCategory[]
  onOpen: () => void
  onRemove: () => void
  onCategory: (categoryId: string | null) => void
}) {
  return (
    <div className="book-card group">
      <button type="button" onClick={onOpen} className="book-card-main" title={book.title}>
        <BookCover book={book} size="md" />
        <span className="book-format">{book.format.toUpperCase()}</span>
        {book.progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
            <div className="h-full bg-white/85" style={{ width: `${Math.round(book.progress * 100)}%` }} />
          </div>
        )}
      </button>
      <div className="book-meta">
        <p className="truncate text-xs font-medium">{book.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{book.author || '未知作者'}</p>
      </div>
      <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Popover
          width="w-48"
          trigger={({ toggle }) => (
            <button type="button" className="book-menu-btn" onClick={toggle} title="更多">
              <MoreHorizontal className="size-3.5" />
            </button>
          )}
        >
          <div className="space-y-1">
            <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              移动到分类
            </p>
            <button type="button" className="menu-item" onClick={() => onCategory(null)}>
              未分类
            </button>
            {categories.map((category) => (
              <button key={category.id} type="button" className="menu-item" onClick={() => onCategory(category.id)}>
                {category.name}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button type="button" className="menu-item text-destructive" onClick={onRemove}>
              <Trash2 className="size-3.5" /> 从书架移除
            </button>
            <p className="px-1 pt-1 text-[10px] text-muted-foreground">
              {formatBytes(book.size)} · {formatDate(book.addedAt)}
            </p>
          </div>
        </Popover>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  onRename,
  onRemove,
}: {
  category: BookCategory
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(category.name)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => name.trim() && name !== category.name && onRename(name.trim())}
        className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm outline-none focus:bg-muted"
      />
      <IconButton icon={<Trash2 className="size-3.5" />} label="删除分类" onClick={onRemove} size="sm" />
    </div>
  )
}

/* --------------------------------- Reading --------------------------------- */

function Reading({ book }: { book: Book }) {
  const settings = useAppStore((s) => s.settings)
  const backgroundTransparency = useAppStore((s) => s.backgroundTransparency)
  const patch = useAppStore((s) => s.patch)
  const close = useReaderStore((s) => s.close)
  const saveProgress = useReaderStore((s) => s.saveProgress)

  const viewerRef = useRef<ViewerHandle>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [progress, setProgress] = useState(book.progress)
  const [locationLabel, setLocationLabel] = useState('')
  const [autoPage, setAutoPage] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const lastSave = useRef(0)
  const pendingSave = useRef<{ fraction: number; location: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushProgress = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const pending = pendingSave.current
    if (!pending) return
    pendingSave.current = null
    lastSave.current = Date.now()
    saveProgress(book.id, pending.fraction, pending.location)
  }

  const handleProgress = (fraction: number, location: string) => {
    setProgress(fraction)
    setLocationLabel(location)
    pendingSave.current = { fraction, location }
    const now = Date.now()
    if (now - lastSave.current > 900) flushProgress()
    else if (!saveTimer.current) saveTimer.current = setTimeout(flushProgress, 900)
  }

  useEffect(() => {
    return () => {
      flushProgress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  const prefs: ReaderPrefs = {
    fontSize: settings.reader.fontSize,
    lineHeight: settings.reader.lineHeight,
    fontFamily: settings.reader.fontFamily,
    textColor: settings.reader.textColor,
    backgroundColor: settings.reader.backgroundColor,
    backgroundTransparency,
    flow: settings.reader.flow,
    stripBlankLines: settings.reader.stripBlankLines,
  }

  const isPdf = book.format === 'pdf'
  const isTxt = book.format === 'txt'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input,textarea,select')) return
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        viewerRef.current?.prev()
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        viewerRef.current?.next()
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
        setTocOpen(false)
        setPrefsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!autoPage) return
    const timer = setInterval(() => viewerRef.current?.next(), settings.reader.autoPageSeconds * 1000)
    return () => clearInterval(timer)
  }, [autoPage, settings.reader.autoPageSeconds])

  useEffect(() => {
    if (!autoScroll) return
    const timer = setInterval(() => viewerRef.current?.autoScroll(settings.reader.autoScrollSpeed * 3), 50)
    return () => clearInterval(timer)
  }, [autoScroll, settings.reader.autoScrollSpeed])

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const found = await viewerRef.current?.search(query)
      setResults(found ?? [])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="reading-header">
        <IconButton icon={<ArrowLeft className="size-4" />} label="返回书架" onClick={close} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{book.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {book.author || '未知作者'} · {book.format.toUpperCase()}
          </p>
        </div>
        {toc.length > 0 && (
          <IconButton
            icon={<ListTree className="size-4" />}
            label="目录"
            active={tocOpen}
            onClick={() => setTocOpen((v) => !v)}
          />
        )}
        <IconButton
          icon={<Search className="size-4" />}
          label="全文搜索"
          active={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        />
        <Popover
          trigger={({ toggle }) => (
            <IconButton icon={<Settings2 className="size-4" />} label="阅读设置" active={prefsOpen} onClick={toggle} />
          )}
          width="w-72"
        >
          <ReaderPrefsPanel prefs={settings.reader} format={book.format} onPatch={(reader) => void patch({ reader })} />
        </Popover>
        {isPdf && (
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              className="px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => viewerRef.current?.zoomOut?.()}
            >
              −
            </button>
            <button
              type="button"
              className="px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => viewerRef.current?.resetZoom?.()}
            >
              100%
            </button>
            <button
              type="button"
              className="px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => viewerRef.current?.zoomIn?.()}
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          className={cn('toggle-btn', autoPage && 'active')}
          onClick={() => setAutoPage((v) => !v)}
          title="自动翻页"
        >
          自动翻页
        </button>
        <button
          type="button"
          className={cn('toggle-btn', autoScroll && 'active')}
          onClick={() => setAutoScroll((v) => !v)}
          title="自动滚动"
        >
          自动滚动
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {isPdf ? (
          <PdfViewer
            ref={viewerRef}
            book={book}
            prefs={prefs}
            initialLocation={book.location}
            onProgress={handleProgress}
            onToc={setToc}
          />
        ) : isTxt ? (
          <TxtViewer
            ref={viewerRef}
            book={book}
            prefs={prefs}
            initialLocation={book.location}
            onProgress={handleProgress}
            onToc={setToc}
          />
        ) : (
          <FoliateViewer
            ref={viewerRef}
            book={book}
            prefs={prefs}
            initialLocation={book.location}
            onProgress={handleProgress}
            onToc={setToc}
          />
        )}

        {tocOpen && (
          <>
            <div className="drawer-mask" onClick={() => setTocOpen(false)} />
            <div className="drawer left-0">
              <div className="drawer-head">
                <span>目录</span>
                <IconButton icon={<X className="size-4" />} label="关闭" onClick={() => setTocOpen(false)} size="sm" />
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <TocList
                  items={toc}
                  onGo={(location) => {
                    viewerRef.current?.goTo(location)
                    setTocOpen(false)
                  }}
                />
              </div>
            </div>
          </>
        )}

        {searchOpen && (
          <>
            <div className="drawer-mask" onClick={() => setSearchOpen(false)} />
            <div className="drawer right-0 w-80">
              <div className="drawer-head">
                <span>全文搜索</span>
                <IconButton
                  icon={<X className="size-4" />}
                  label="关闭"
                  onClick={() => setSearchOpen(false)}
                  size="sm"
                />
              </div>
              <div className="border-b border-border p-3">
                <div className="flex gap-2">
                  <TextInput
                    value={query}
                    onChange={setQuery}
                    placeholder="输入关键词"
                    onEnter={() => void runSearch()}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    onClick={() => void runSearch()}
                    disabled={searching}
                  >
                    {searching ? '搜索中' : '搜索'}
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {results.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">{query ? '没有匹配结果' : '输入关键词开始搜索'}</p>
                ) : (
                  results.map((result, index) => (
                    <button
                      key={`${result.location}-${index}`}
                      type="button"
                      className="search-result"
                      onClick={() => {
                        viewerRef.current?.goTo(result.location)
                        setSearchOpen(false)
                      }}
                    >
                      {result.label && <span className="search-result-label">{result.label}</span>}
                      <span className="search-result-text">
                        {typeof result.excerpt === 'string'
                          ? result.excerpt
                          : result.excerpt
                            ? `${result.excerpt.pre}${result.excerpt.match}${result.excerpt.post}`
                            : result.location}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="reading-footer">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary/80" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">
          {locationLabel && locationLabel.includes('/') ? locationLabel : `${Math.round(progress * 100)}%`}
        </span>
      </div>
    </div>
  )
}

function ReaderPrefsPanel({
  prefs,
  format,
  onPatch,
}: {
  prefs: {
    fontSize: number
    lineHeight: number
    fontFamily: string
    textColor: string
    backgroundColor: string
    flow: 'paginated' | 'scrolled'
    stripBlankLines: boolean
    autoPageSeconds: number
    autoScrollSpeed: number
  }
  format: string
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const isPdf = format === 'pdf'
  const isTxt = format === 'txt'
  return (
    <div className="space-y-3">
      {isPdf && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          PDF 为固定版式，字体、字号、行距和文字颜色不可用；请使用阅读页顶部的缩放按钮。
        </p>
      )}
      {!isPdf && (
        <>
          <Slider
            label="字号"
            value={prefs.fontSize}
            min={12}
            max={40}
            suffix="px"
            onChange={(value) => onPatch({ fontSize: value })}
          />
          <Slider
            label="行距"
            value={prefs.lineHeight}
            min={1.2}
            max={2.6}
            step={0.1}
            onChange={(value) => onPatch({ lineHeight: value })}
          />
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">字体</p>
            <div className="flex flex-wrap gap-1.5">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.label}
                  type="button"
                  onClick={() => onPatch({ fontFamily: font.value })}
                  className={cn('chip', prefs.fontFamily === font.value && 'active')}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">排版</p>
        <Segmented
          value={prefs.flow}
          options={[
            { value: 'scrolled', label: '滚动' },
            { value: 'paginated', label: '翻页' },
          ]}
          onChange={(value) => onPatch({ flow: value })}
        />
      </div>
      {!isPdf && (
        <ColorField label="文字颜色" value={prefs.textColor} onChange={(value) => onPatch({ textColor: value })} />
      )}
      <ColorField
        label="背景颜色"
        value={prefs.backgroundColor}
        onChange={(value) => onPatch({ backgroundColor: value })}
      />
      {isTxt && (
        <Switch
          checked={prefs.stripBlankLines}
          onChange={(value) => onPatch({ stripBlankLines: value })}
          label="去除 TXT 空行"
        />
      )}
      <Slider
        label="自动翻页间隔"
        value={prefs.autoPageSeconds}
        min={3}
        max={120}
        suffix="s"
        onChange={(value) => onPatch({ autoPageSeconds: value })}
      />
      <Slider
        label="自动滚动速度"
        value={prefs.autoScrollSpeed}
        min={0.5}
        max={12}
        step={0.5}
        onChange={(value) => onPatch({ autoScrollSpeed: value })}
      />
    </div>
  )
}

function TocList({ items, onGo, depth = 0 }: { items: TocItem[]; onGo: (location: string) => void; depth?: number }) {
  return (
    <>
      {items.map((item, index) => (
        <div key={`${item.location}-${index}`}>
          <button
            type="button"
            className="toc-item"
            style={{ paddingLeft: depth * 12 + 8 }}
            onClick={() => onGo(item.location)}
          >
            {item.label || '未命名'}
          </button>
          {item.subitems?.length ? <TocList items={item.subitems} onGo={onGo} depth={depth + 1} /> : null}
        </div>
      ))}
    </>
  )
}
