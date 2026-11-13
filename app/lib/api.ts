import type {
  AppSettings,
  Book,
  BookCategory,
  Bookmark,
  BookFormat,
  BossKeyStatus,
  HistoryEntry,
  LockStatus,
  MySite,
  Rect,
  TabInfo,
  WindowStatePayload,
} from '@/lib/shared/types'

const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
  window.idlewise.invoke(channel, payload) as Promise<T>

export const api = {
  on: (channel: string, callback: (payload: any) => void) => window.idlewise.on(channel, callback),

  getSettings: () => invoke<AppSettings>('settings:get'),
  updateSettings: (patch: Record<string, unknown>) => invoke<AppSettings>('settings:update', patch),
  resetSettings: () => invoke<AppSettings>('settings:reset'),

  windowState: () => invoke<WindowStatePayload>('window:state'),
  setOpacity: (opacity: number) => invoke<number>('window:set-opacity', { opacity }),
  previewOpacity: (payload: { opacity?: number; backgroundTransparency?: number }) =>
    invoke<boolean>('window:preview-opacity', payload),
  setBackgroundTransparency: (value: number) => invoke<number>('window:set-background-transparency', { value }),
  setAlwaysOnTop: (enabled: boolean) => invoke<boolean>('window:set-always-on-top', { enabled }),
  setContentProtection: (enabled: boolean) => invoke<boolean>('window:set-content-protection', { enabled }),
  setMini: (enabled: boolean) => invoke<boolean>('window:set-mini', { enabled }),
  toggleMaximize: () => invoke<boolean>('window:toggle-maximize'),
  minimize: () => invoke<boolean>('window:minimize'),
  closeHide: () => invoke<boolean>('window:close-hide'),
  showWindow: () => invoke<boolean>('window:show'),
  setDefaultSize: (width: number, height: number) =>
    invoke<{ width: number; height: number }>('window:set-default-size', { width, height }),
  pickBackground: () => invoke<string | null>('window:pick-background'),
  setBackgroundColor: (color: string) => invoke<unknown>('window:set-background-color', { color }),
  clearBackground: () => invoke<unknown>('window:clear-background'),
  setRenderMode: (mode: 'standard' | 'transparent') => invoke<boolean>('window:set-render-mode', { mode }),
  relaunch: () => invoke<boolean>('window:relaunch'),
  dragStart: () => invoke<boolean>('window:drag-start'),
  dragStop: () => invoke<boolean>('window:drag-stop'),
  reportHeaderRect: (rect: Rect) => invoke<boolean>('window:report-header-rect', rect),
  reportContentRect: (rect: Rect) => invoke<boolean>('window:report-content-rect', rect),
  reportOverlay: (open: boolean) => invoke<boolean>('window:report-overlay', { open }),
  reportPopover: (open: boolean) => invoke<boolean>('window:report-popover', { open }),
  openOverlay: (
    kind: 'opacity' | 'browser' | 'stealth' | 'fontcolor',
    anchor?: { x: number; y: number; width: number; height: number },
    context?: { readerFormat?: string | null }
  ) => invoke<boolean>('overlay:open', { kind, anchor, context }),
  closeOverlay: () => invoke<boolean>('overlay:close'),
  appInfo: () =>
    invoke<{
      name: string
      version: string
      userData: string
      packaged: boolean
      platform: string
      chrome: string
      electron: string
      node: string
    }>('window:app-info'),
  openUserData: () => invoke<boolean>('window:open-user-data'),

  setBossKeys: (payload: { enabled: boolean; toggleKey: string; hideKey: string }) =>
    invoke<BossKeyStatus>('bosskey:set', payload),
  applyBossKeys: () => invoke<BossKeyStatus>('bosskey:apply'),
  getBossKeys: () => invoke<BossKeyStatus>('bosskey:get'),

  lockStatus: () => invoke<LockStatus>('lock:status'),
  setPin: (pin: string) => invoke<{ ok: boolean; message?: string }>('lock:set-pin', { pin }),
  verifyPin: (pin: string) => invoke<{ ok: boolean }>('lock:verify', { pin }),
  disablePin: (pin: string) => invoke<{ ok: boolean }>('lock:disable', { pin }),
  lockNow: () => invoke<LockStatus>('lock:now'),
  unlock: (pin: string) => invoke<LockStatus>('lock:unlock', { pin }),
  setLockOnStartup: (enabled: boolean) => invoke<unknown>('lock:set-on-startup', { enabled }),

  pickTrayIcon: () => invoke<string | null>('tray:pick-icon'),
  resetTrayIcon: () => invoke<boolean>('tray:reset-icon'),
  setTrayTooltipHidden: (enabled: boolean) => invoke<boolean>('tray:set-hide-tooltip', { enabled }),

  browserTabs: () => invoke<TabInfo[]>('browser:tabs'),
  createTab: (url = '', activate = true) => invoke<TabInfo | null>('browser:create-tab', { url, activate }),
  closeTab: (id: string) => invoke<boolean>('browser:close-tab', { id }),
  activateTab: (id: string) => invoke<boolean>('browser:activate-tab', { id }),
  navigate: (url: string, id?: string) => invoke<string>('browser:navigate', { url, id }),
  back: () => invoke<boolean>('browser:back'),
  forward: () => invoke<boolean>('browser:forward'),
  reload: () => invoke<boolean>('browser:reload'),
  stop: () => invoke<boolean>('browser:stop'),
  home: () => invoke<boolean>('browser:home'),
  setBrowserVisible: (visible: boolean) => invoke<boolean>('browser:set-visible', { visible }),
  setZoom: (zoom: number) => invoke<number>('browser:set-zoom', { zoom }),
  setMobile: (enabled: boolean) => invoke<boolean>('browser:set-mobile', { enabled }),
  toggleCompat: (id?: string) => invoke<boolean>('browser:toggle-compat', { id }),
  setVideoSpeed: (speed: number) => invoke<number>('browser:set-video-speed', { speed }),
  setBrowserPrefs: (patch: Record<string, unknown>) => invoke<unknown>('browser:set-prefs', patch),

  history: () => invoke<HistoryEntry[]>('history:list'),
  addHistory: (url: string, title: string) => invoke<HistoryEntry[]>('history:add', { url, title }),
  removeHistory: (id: string) => invoke<HistoryEntry[]>('history:remove', { id }),
  clearHistory: () => invoke<HistoryEntry[]>('history:clear'),

  bookmarks: () => invoke<Bookmark[]>('bookmarks:list'),
  addBookmark: (url: string, title: string) => invoke<Bookmark[]>('bookmarks:add', { url, title }),
  removeBookmark: (id: string) => invoke<Bookmark[]>('bookmarks:remove', { id }),
  removeBookmarkByUrl: (url: string) => invoke<Bookmark[]>('bookmarks:remove-url', { url }),
  hasBookmark: (url: string) => invoke<boolean>('bookmarks:has', { url }),

  sites: () => invoke<MySite[]>('sites:list'),
  addSite: (name: string, url: string, compat?: boolean) => invoke<MySite[]>('sites:add', { name, url, compat }),
  updateSite: (id: string, patch: Partial<MySite>) => invoke<MySite[]>('sites:update', { id, patch }),
  removeSite: (id: string) => invoke<MySite[]>('sites:remove', { id }),

  books: () => invoke<Book[]>('library:list'),
  categories: () => invoke<BookCategory[]>('library:categories'),
  importDialog: () => invoke<string[]>('library:import-dialog'),
  readFile: (path: string) => invoke<{ name: string; size: number; bytes: Uint8Array }>('library:read-file', { path }),
  upsertBook: (book: Partial<Book> & { path: string; title: string; format: BookFormat }) =>
    invoke<Book>('library:upsert', book),
  removeBook: (id: string) => invoke<Book[]>('library:remove', { id }),
  setProgress: (id: string, progress: number, location: string) =>
    invoke<boolean>('library:set-progress', { id, progress, location }),
  setBookCategory: (id: string, categoryId: string | null) =>
    invoke<Book[]>('library:set-category', { id, categoryId }),
  addCategory: (name: string) => invoke<BookCategory>('library:add-category', { name }),
  renameCategory: (id: string, name: string) => invoke<BookCategory[]>('library:rename-category', { id, name }),
  removeCategory: (id: string) =>
    invoke<{ categories: BookCategory[]; books: Book[] }>('library:remove-category', { id }),

  authStatus: () => invoke<{ enabled: boolean; mode: string; session: unknown }>('auth:status'),
  quit: () => invoke<boolean>('app:quit'),
}
