import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Clock,
  Globe2,
  Home,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { formatDate, hostOf } from '@/lib/shared/utils'
import type { MySite } from '@/lib/shared/types'
import { cn } from '@/app/lib/cn'
import { api } from '@/app/lib/api'
import { useAppStore, useBrowserStore } from '@/app/store'
import { IconButton, Modal, Popover, Switch, TextInput } from '@/app/components/ui'

export default function BrowserView({ compact, active }: { compact: boolean; active: boolean }) {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeId = useBrowserStore((s) => s.activeId)
  const panel = useBrowserStore((s) => s.panel)
  const newTab = useBrowserStore((s) => s.newTab)
  const close = useBrowserStore((s) => s.close)
  const activate = useBrowserStore((s) => s.activate)
  const navigate = useBrowserStore((s) => s.navigate)
  const home = useBrowserStore((s) => s.home)
  const setPanel = useBrowserStore((s) => s.setPanel)
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null
  const viewportRef = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (tabs.length === 0) void newTab('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length])

  useEffect(() => {
    setAddress(activeTab?.url ?? '')
  }, [activeTab?.id, activeTab?.url])

  useEffect(() => {
    if (!active) return
    const report = () => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (rect) void api.reportContentRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    report()
    const observer = new ResizeObserver(report)
    if (viewportRef.current) observer.observe(viewportRef.current)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [active, panel, activeTab?.url])

  const showHome = panel !== 'none' || !activeTab?.url
  const homePanel = panel === 'none' ? 'sites' : panel

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="tabbar">
        <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'tab-item',
                tab.id === activeId && panel !== 'history' && panel !== 'bookmarks' && 'active'
              )}
              onAuxClick={(event) => {
                if (event.button !== 1) return
                event.preventDefault()
                void close(tab.id)
              }}
            >
              <button
                type="button"
                className="tab-title"
                onClick={() => void activate(tab.id)}
                title={tab.title || tab.url}
              >
                {tab.loading ? <span className="tab-spinner" /> : <Globe2 className="size-3 shrink-0 opacity-60" />}
                <span className="truncate">{tab.title || hostOf(tab.url) || '新标签页'}</span>
              </button>
              <button type="button" className="tab-close" onClick={() => void close(tab.id)} title="关闭标签">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {(panel === 'history' || panel === 'bookmarks') && (
            <div
              className="tab-item active"
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  setPanel('none')
                }
              }}
            >
              <button
                type="button"
                className="tab-title"
                onClick={() => setPanel(panel)}
                title={panel === 'history' ? '历史记录' : '收藏夹'}
              >
                {panel === 'history' ? (
                  <Clock className="size-3 shrink-0 opacity-60" />
                ) : (
                  <Star className="size-3 shrink-0 opacity-60" />
                )}
                <span className="truncate">{panel === 'history' ? '历史记录' : '收藏夹'}</span>
              </button>
              <button type="button" className="tab-close" onClick={() => setPanel('none')} title="关闭标签">
                <X className="size-3" />
              </button>
            </div>
          )}
          <button type="button" className="tab-add" onClick={() => void newTab('')} title="新建标签">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="browser-toolbar">
        <IconButton
          icon={<ArrowLeft className="size-4" />}
          label="后退"
          disabled={!activeTab?.canGoBack}
          onClick={() => void api.back()}
          size="sm"
        />
        <IconButton
          icon={<ArrowRight className="size-4" />}
          label="前进"
          disabled={!activeTab?.canGoForward}
          onClick={() => void api.forward()}
          size="sm"
        />
        <IconButton
          icon={<RefreshCw className={cn('size-4', activeTab?.loading && 'animate-spin')} />}
          label={activeTab?.loading ? '停止' : '刷新'}
          onClick={() => (activeTab?.loading ? void api.stop() : void api.reload())}
          size="sm"
        />
        <IconButton icon={<Home className="size-4" />} label="主页" onClick={() => void home()} size="sm" />

        <div className="browser-address">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void navigate(address)
            }}
            placeholder="搜索或输入网址"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          <BookmarkStar url={activeTab?.url ?? ''} title={activeTab?.title ?? ''} />
        </div>

        <IconButton
          icon={<Clock className="size-4" />}
          label="历史记录"
          active={panel === 'history'}
          onClick={() => setPanel(panel === 'history' ? 'none' : 'history')}
          size="sm"
        />
        <IconButton
          icon={<Star className="size-4" />}
          label="收藏夹"
          active={panel === 'bookmarks'}
          onClick={() => setPanel(panel === 'bookmarks' ? 'none' : 'bookmarks')}
          size="sm"
        />
        <BrowserPrefsButton />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={viewportRef} className="relative min-h-0 flex-1">
          {showHome && <BrowserHome panel={homePanel} compact={compact} />}
        </div>
      </div>
    </div>
  )
}

function BookmarkStar({ url, title }: { url: string; title: string }) {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!url) {
      setSaved(false)
      return
    }
    void api.hasBookmark(url).then((value) => {
      if (!cancelled) setSaved(value)
    })
    return () => {
      cancelled = true
    }
  }, [url])
  return (
    <button
      type="button"
      title={saved ? '取消收藏' : '收藏此页'}
      disabled={!url}
      onClick={async () => {
        if (!url) return
        await useBrowserStore.getState().toggleBookmark(url, title || url)
        setSaved(await api.hasBookmark(url))
      }}
      className={cn(
        'shrink-0 rounded p-1 transition-colors',
        saved ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground',
        !url && 'opacity-30'
      )}
    >
      {saved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
    </button>
  )
}

function BrowserPrefsButton() {
  return (
    <IconButton
      icon={<SlidersHorizontal className="size-4" />}
      label="网页设置"
      size="sm"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        void api.openOverlay('browser', { x: rect.left, y: rect.top, width: rect.width, height: rect.height })
      }}
    />
  )
}

function BrowserHome({ panel, compact }: { panel: string; compact: boolean }) {
  const sites = useBrowserStore((s) => s.sites)
  const history = useBrowserStore((s) => s.history)
  const bookmarks = useBrowserStore((s) => s.bookmarks)
  const navigate = useBrowserStore((s) => s.navigate)
  const refreshSites = useBrowserStore((s) => s.refreshSites)
  const refreshHistory = useBrowserStore((s) => s.refreshHistory)
  const refreshBookmarks = useBrowserStore((s) => s.refreshBookmarks)
  const [editor, setEditor] = useState<{ id?: string; name: string; url: string; compat: boolean } | null>(null)

  useEffect(() => {
    if (panel === 'history') void refreshHistory()
    if (panel === 'bookmarks') void refreshBookmarks()
    if (panel === 'sites') void refreshSites()
  }, [panel, refreshHistory, refreshSites, refreshBookmarks])

  // 「我的站点」里的兼容模式此前只存了一个标记，导航时从未落到 compatHosts，
  // 导致站点卡片显示「兼容」但实际仍是普通模式。打开站点时把主机名同步进去。
  const openSite = async (site: MySite, newTab = false) => {
    if (site.compat) {
      const state = useAppStore.getState()
      const host = hostOf(site.url)
      const hosts = state.settings.browser.compatHosts
      if (host && !hosts.some((item) => host === item || host.endsWith(`.${item}`))) {
        await state.patch({ browser: { compatHosts: [...hosts, host] } })
      }
    }
    if (newTab) await useBrowserStore.getState().newTab(site.url)
    else await navigate(site.url)
  }

  return (
    <div className="browser-home">
      <div className="browser-home-head">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {panel === 'history' ? '历史记录' : panel === 'bookmarks' ? '收藏夹' : '我的站点'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {panel === 'history'
              ? `${history.length} 条记录`
              : panel === 'bookmarks'
                ? `${bookmarks.length} 个收藏`
                : `${sites.length} 个站点`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {panel === 'sites' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditor({ name: '', url: '', compat: false })}
            >
              <Plus className="size-3.5" /> 添加站点
            </button>
          )}
          {panel === 'history' && history.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                await api.clearHistory()
                await refreshHistory()
              }}
            >
              <Trash2 className="size-3.5" /> 清空
            </button>
          )}
        </div>
      </div>

      {panel === 'sites' && (
        <div className={cn('site-grid', compact && 'site-grid-compact')}>
          {sites.map((site) => (
            <div key={site.id} className="site-card group">
              <button
                type="button"
                className="site-card-main"
                onClick={() => void openSite(site)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  void openSite(site, true)
                }}
                title={site.url}
              >
                <span className="site-avatar">{site.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{site.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {site.url.replace(/^https?:\/\//, '')}
                  </span>
                </span>
                {site.compat && <span className="site-badge">兼容</span>}
              </button>
              <Popover
                width="w-44"
                trigger={({ toggle }) => (
                  <button type="button" className="site-more" onClick={toggle} title="站点操作">
                    <MoreHorizontal className="size-3.5" />
                  </button>
                )}
              >
                <div className="space-y-1">
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => setEditor({ id: site.id, name: site.name, url: site.url, compat: site.compat })}
                  >
                    编辑站点
                  </button>
                  <button
                    type="button"
                    className="menu-item text-destructive"
                    onClick={async () => {
                      await api.removeSite(site.id)
                      await refreshSites()
                    }}
                  >
                    删除站点
                  </button>
                </div>
              </Popover>
            </div>
          ))}
          {sites.length === 0 && <p className="text-xs text-muted-foreground">还没有站点，点击右上角添加。</p>}
        </div>
      )}

      {panel === 'history' && (
        <div className="list-panel">
          {history.map((entry) => (
            <div key={entry.id} className="list-row">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => void navigate(entry.url)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  void useBrowserStore.getState().newTab(entry.url)
                }}
              >
                <span className="block truncate text-sm">{entry.title || entry.url}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{entry.url}</span>
              </button>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(entry.visitedAt)}</span>
              <IconButton
                icon={<X className="size-3.5" />}
                label="删除记录"
                size="sm"
                onClick={async () => {
                  await api.removeHistory(entry.id)
                  await refreshHistory()
                }}
              />
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-muted-foreground">还没有浏览记录。</p>}
        </div>
      )}

      {panel === 'bookmarks' && (
        <div className="list-panel">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="list-row">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => void navigate(bookmark.url)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  void useBrowserStore.getState().newTab(bookmark.url)
                }}
              >
                <span className="block truncate text-sm">{bookmark.title || bookmark.url}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{bookmark.url}</span>
              </button>
              <IconButton
                icon={<Trash2 className="size-3.5" />}
                label="删除收藏"
                size="sm"
                onClick={async () => {
                  await api.removeBookmark(bookmark.id)
                  await refreshBookmarks()
                }}
              />
            </div>
          ))}
          {bookmarks.length === 0 && (
            <p className="text-xs text-muted-foreground">还没有收藏，浏览网页时点地址栏右侧星标即可。</p>
          )}
        </div>
      )}

      <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.id ? '编辑站点' : '添加站点'}>
        {editor && (
          <div className="space-y-3">
            <label className="block space-y-1 text-xs text-muted-foreground">
              名称
              <TextInput
                value={editor.name}
                onChange={(name) => setEditor({ ...editor, name })}
                placeholder="例如：微信读书"
                autoFocus
              />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              网址
              <TextInput
                value={editor.url}
                onChange={(url) => setEditor({ ...editor, url })}
                placeholder="https://example.com"
              />
            </label>
            <Switch
              checked={editor.compat}
              onChange={(compat) => setEditor({ ...editor, compat })}
              label="此站点默认开启兼容模式"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  if (!editor.url.trim()) return
                  if (editor.id)
                    await api.updateSite(editor.id, { name: editor.name, url: editor.url, compat: editor.compat })
                  else await api.addSite(editor.name, editor.url, editor.compat)
                  setEditor(null)
                  await refreshSites()
                }}
              >
                保存
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
