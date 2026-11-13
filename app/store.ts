import { create } from 'zustand'
import { createDefaultSettings, mergeDeep, sanitizeSettings } from '@/lib/shared/settings'
import type {
  AppSettings,
  Book,
  BookCategory,
  Bookmark,
  BossKeyStatus,
  HistoryEntry,
  MySite,
  TabInfo,
} from '@/lib/shared/types'
import { api } from './lib/api'
import { importBookFile } from './features/import'

export type ViewKey = 'library' | 'browser' | 'ai'
export type BrowserPanel = 'none' | 'sites' | 'history' | 'bookmarks'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
}

let toastSeq = 1

function backgroundUrlOf(settings: AppSettings): string | null {
  const bg = settings.window.background
  if (bg.type !== 'image' || !bg.imagePath) return null
  return `idlewise-asset://local/${bg.imagePath.split('\\').join('/')}`
}

export type SettingsTabKey = 'general' | 'window' | 'stealth' | 'security' | 'about'

interface AppState {
  settings: AppSettings
  ready: boolean
  view: ViewKey
  settingsOpen: boolean
  settingsTab: SettingsTabKey
  locked: boolean
  lockEnabled: boolean
  mini: boolean
  maximized: boolean
  headerVisible: boolean
  bodyVisible: boolean
  opacity: number
  backgroundTransparency: number
  bossStatus: BossKeyStatus
  backgroundUrl: string | null
  toasts: Toast[]
  init(): Promise<void>
  patch(patch: Record<string, unknown>): Promise<void>
  setView(view: ViewKey): void
  setSettingsOpen(open: boolean): void
  openSettings(tab?: SettingsTabKey): void
  setMini(mini: boolean): void
  setMaximized(maximized: boolean): void
  setLocked(locked: boolean): void
  previewOpacity(value: number): void
  previewBackgroundTransparency(value: number): void
  toast(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: createDefaultSettings(),
  ready: false,
  view: 'library',
  settingsOpen: false,
  settingsTab: 'general',
  locked: false,
  lockEnabled: false,
  mini: false,
  maximized: false,
  headerVisible: true,
  bodyVisible: true,
  opacity: 100,
  backgroundTransparency: 100,
  bossStatus: { ok: true, toggleKey: 'Alt+Z', hideKey: 'Alt+X' },
  backgroundUrl: null,
  toasts: [],

  async init() {
    try {
      const [settings, lock, boss] = await Promise.all([api.getSettings(), api.lockStatus(), api.getBossKeys()])
      set({
        settings,
        ready: true,
        opacity: settings.window.opacity,
        backgroundTransparency: settings.window.backgroundTransparency,
        backgroundUrl: backgroundUrlOf(settings),
        locked: lock.locked,
        lockEnabled: lock.enabled,
        bossStatus: boss,
      })
    } catch (err) {
      set({ ready: true })
      get().toast(`初始化失败：${String(err)}`, 'error')
    }
  },

  async patch(patch) {
    const optimistic = sanitizeSettings(mergeDeep(get().settings, patch))
    set({
      settings: optimistic,
      opacity: optimistic.window.opacity,
      backgroundTransparency: optimistic.window.backgroundTransparency,
      backgroundUrl: backgroundUrlOf(optimistic),
    })
    try {
      const settings = await api.updateSettings(patch)
      set({
        settings,
        opacity: settings.window.opacity,
        backgroundTransparency: settings.window.backgroundTransparency,
        backgroundUrl: backgroundUrlOf(settings),
      })
    } catch (err) {
      get().toast(`保存设置失败：${String(err)}`, 'error')
    }
  },

  setView(view) {
    set({ view })
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
    void api.reportOverlay(open)
  },

  openSettings(tab = 'general') {
    set({ settingsOpen: true, settingsTab: tab })
    void api.reportOverlay(true)
  },

  setMini(mini) {
    set({ mini })
  },

  setMaximized(maximized) {
    set({ maximized })
  },

  previewOpacity(value) {
    set({ opacity: value })
    void api.previewOpacity({ opacity: value })
  },

  previewBackgroundTransparency(value) {
    set({ backgroundTransparency: value })
    void api.previewOpacity({ backgroundTransparency: value })
  },

  setLocked(locked) {
    set({ locked })
  },

  toast(message, kind = 'info') {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => get().dismissToast(id), 3600)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

let browserInit = false
function ensureBrowserListeners(): void {
  if (browserInit) return
  browserInit = true
  api.on('browser:tabs', (tabs: TabInfo[]) => {
    useBrowserStore.setState((s) => {
      const activeId = s.activeId && tabs.some((t) => t.id === s.activeId) ? s.activeId : (tabs[0]?.id ?? null)
      return { tabs, activeId }
    })
  })
  api.on('browser:active', (tab: TabInfo | null) => {
    useBrowserStore.setState({ activeId: tab?.id ?? null })
  })
}

interface BrowserState {
  tabs: TabInfo[]
  activeId: string | null
  panel: BrowserPanel
  sites: MySite[]
  history: HistoryEntry[]
  bookmarks: Bookmark[]
  load(): Promise<void>
  newTab(url?: string): Promise<void>
  close(id: string): Promise<void>
  activate(id: string): Promise<void>
  navigate(url: string): Promise<void>
  home(): Promise<void>
  setPanel(panel: BrowserPanel): void
  refreshPanels(): Promise<void>
  refreshSites(): Promise<void>
  refreshHistory(): Promise<void>
  refreshBookmarks(): Promise<void>
  toggleBookmark(url: string, title: string): Promise<boolean>
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeId: null,
  panel: 'sites',
  sites: [],
  history: [],
  bookmarks: [],

  async load() {
    ensureBrowserListeners()
    try {
      const [tabs, sites, history, bookmarks] = await Promise.all([
        api.browserTabs(),
        api.sites(),
        api.history(),
        api.bookmarks(),
      ])
      set({ tabs, activeId: tabs[0]?.id ?? null, sites, history, bookmarks })
    } catch (err) {
      useAppStore.getState().toast(`浏览器数据加载失败：${String(err)}`, 'error')
    }
  },

  async newTab(url = '') {
    await api.createTab(url, true)
    if (!url) set({ panel: 'sites' })
    else set({ panel: 'none' })
  },

  async close(id) {
    await api.closeTab(id)
    if (get().tabs.length === 0) await api.createTab('', true)
  },

  async activate(id) {
    await api.activateTab(id)
    set({ panel: 'none' })
  },

  async navigate(url) {
    if (!url.trim()) return
    await api.navigate(url)
    set({ panel: 'none' })
  },

  async home() {
    await api.home()
    set({ panel: 'sites' })
  },

  setPanel(panel) {
    set({ panel })
    if (panel !== 'none') void api.setBrowserVisible(false)
  },

  async refreshPanels() {
    await Promise.all([get().refreshSites(), get().refreshHistory(), get().refreshBookmarks()])
  },

  async refreshSites() {
    set({ sites: await api.sites() })
  },

  async refreshHistory() {
    set({ history: await api.history() })
  },

  async refreshBookmarks() {
    set({ bookmarks: await api.bookmarks() })
  },

  async toggleBookmark(url, title) {
    const has = await api.hasBookmark(url)
    const next = has ? await api.removeBookmarkByUrl(url) : await api.addBookmark(url, title)
    set({ bookmarks: next })
    useAppStore.getState().toast(has ? '已取消收藏' : '已加入收藏', 'success')
    return !has
  },
}))

interface ReaderState {
  books: Book[]
  categories: BookCategory[]
  currentId: string | null
  categoryFilter: string | null
  query: string
  importing: boolean
  load(): Promise<void>
  importBooks(): Promise<void>
  importPaths(paths: string[]): Promise<void>
  open(id: string): void
  close(): void
  saveProgress(id: string, progress: number, location: string): void
  remove(id: string): Promise<void>
  setCategory(id: string, categoryId: string | null): Promise<void>
  addCategory(name: string): Promise<void>
  renameCategory(id: string, name: string): Promise<void>
  removeCategory(id: string): Promise<void>
  setQuery(query: string): void
  setCategoryFilter(id: string | null): void
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  books: [],
  categories: [],
  currentId: null,
  categoryFilter: null,
  query: '',
  importing: false,

  async load() {
    try {
      const [books, categories] = await Promise.all([api.books(), api.categories()])
      set({ books, categories })
    } catch (err) {
      useAppStore.getState().toast(`书架加载失败：${String(err)}`, 'error')
    }
  },

  async importBooks() {
    const paths = await api.importDialog()
    if (paths.length) await get().importPaths(paths)
  },

  async importPaths(paths) {
    if (!paths.length) return
    set({ importing: true })
    let ok = 0
    let failed = 0
    for (const path of paths) {
      try {
        const meta = await importBookFile(path)
        await api.upsertBook(meta)
        ok += 1
      } catch (err) {
        failed += 1
        console.error('[import]', path, err)
      }
    }
    set({ importing: false })
    await get().load()
    if (ok)
      useAppStore
        .getState()
        .toast(`已导入 ${ok} 本书${failed ? `，${failed} 本失败` : ''}`, failed ? 'info' : 'success')
    else useAppStore.getState().toast(`导入失败（${failed}）`, 'error')
  },

  open(id) {
    set({ currentId: id })
  },

  close() {
    set({ currentId: null })
  },

  saveProgress(id, progress, location) {
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? { ...b, progress, location, lastReadAt: Date.now() } : b)),
    }))
    void api.setProgress(id, progress, location)
  },

  async remove(id) {
    const books = await api.removeBook(id)
    set((s) => ({ books, currentId: s.currentId === id ? null : s.currentId }))
    useAppStore.getState().toast('已从书架移除', 'success')
  },

  async setCategory(id, categoryId) {
    const books = await api.setBookCategory(id, categoryId)
    set({ books })
  },

  async addCategory(name) {
    await api.addCategory(name)
    set({ categories: await api.categories() })
  },

  async renameCategory(id, name) {
    set({ categories: await api.renameCategory(id, name) })
  },

  async removeCategory(id) {
    const result = await api.removeCategory(id)
    set({
      categories: result.categories,
      books: result.books,
      categoryFilter: get().categoryFilter === id ? null : get().categoryFilter,
    })
  },

  setQuery(query) {
    set({ query })
  },

  setCategoryFilter(id) {
    set({ categoryFilter: id })
  },
}))
