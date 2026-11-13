import { useEffect, useRef } from 'react'
import {
  Blend,
  BookOpen,
  Contrast,
  Eye,
  EyeOff,
  Globe2,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Scaling,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '@/app/lib/cn'
import appLogo from '@/app/assets/logo.png'
import { api } from '@/app/lib/api'
import { useAppStore, useBrowserStore, useReaderStore } from '@/app/store'
import { IconButton, Popover, Slider, Switch, ToastViewport } from '@/app/components/ui'
import ReaderView from '@/app/features/Reader'
import BrowserView from '@/app/features/Browser'
import AiTools from '@/app/features/AiTools'
import SettingsPanel from '@/app/features/Settings'
import LockScreen from '@/app/features/Lock'

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const settings = useAppStore((s) => s.settings)
  const view = useAppStore((s) => s.view)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const locked = useAppStore((s) => s.locked)
  const lockEnabled = useAppStore((s) => s.lockEnabled)
  const mini = useAppStore((s) => s.mini)
  const maximized = useAppStore((s) => s.maximized)
  const headerVisible = useAppStore((s) => s.headerVisible)
  const bodyVisible = useAppStore((s) => s.bodyVisible)
  const opacity = useAppStore((s) => s.opacity)
  const backgroundTransparency = useAppStore((s) => s.backgroundTransparency)
  const settingsTab = useAppStore((s) => s.settingsTab)
  const backgroundUrl = useAppStore((s) => s.backgroundUrl)
  const init = useAppStore((s) => s.init)
  const setView = useAppStore((s) => s.setView)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const openSettings = useAppStore((s) => s.openSettings)
  const setMini = useAppStore((s) => s.setMini)
  const setMaximized = useAppStore((s) => s.setMaximized)
  const setLocked = useAppStore((s) => s.setLocked)
  const patch = useAppStore((s) => s.patch)
  const previewOpacity = useAppStore((s) => s.previewOpacity)
  const previewBackgroundTransparency = useAppStore((s) => s.previewBackgroundTransparency)

  const headerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void init()
    void useBrowserStore.getState().load()
    void useReaderStore.getState().load()
  }, [init])

  useEffect(() => {
    const handler = (event: Event) => {
      const paths = (event as CustomEvent<string[]>).detail
      if (Array.isArray(paths) && paths.length) void useReaderStore.getState().importPaths(paths)
    }
    window.addEventListener('idlewise:import-paths', handler)
    return () => window.removeEventListener('idlewise:import-paths', handler)
  }, [])

  useEffect(() => {
    const subscribe = (channel: string, handler: (payload: any) => void) => api.on(channel, handler)
    const offs = [
      subscribe('settings:changed', (next) => {
        useAppStore.setState({
          settings: next,
          opacity: next.window.opacity,
          backgroundTransparency: next.window.backgroundTransparency,
        })
      }),
      subscribe('window:state', (state) => {
        useAppStore.setState({
          opacity: state.opacity,
          backgroundTransparency: state.backgroundTransparency,
          mini: state.miniMode,
          maximized: state.maximized,
        })
      }),
      subscribe('window:opacity', (value: number) => useAppStore.setState({ opacity: value })),
      subscribe('window:background-transparency', (value: number) =>
        useAppStore.setState({ backgroundTransparency: value })
      ),
      subscribe('window:mini', (value: boolean) => setMini(Boolean(value))),
      subscribe('stealth:header', (visible: boolean) => useAppStore.setState({ headerVisible: Boolean(visible) })),
      subscribe('stealth:body', (visible: boolean) => useAppStore.setState({ bodyVisible: Boolean(visible) })),
      subscribe('lock:changed', (status) => {
        useAppStore.setState({ locked: Boolean(status?.locked), lockEnabled: Boolean(status?.enabled) })
      }),
      subscribe('bosskey:status', (status) => useAppStore.setState({ bossStatus: status })),
    ]
    return () => offs.forEach((off) => off())
  }, [setMini])

  useEffect(() => {
    void api.reportOverlay(settingsOpen || locked)
  }, [settingsOpen, locked])

  useEffect(() => {
    const report = () => {
      const header = headerRef.current?.getBoundingClientRect()
      const content = contentRef.current?.getBoundingClientRect()
      if (header) void api.reportHeaderRect({ x: header.x, y: header.y, width: header.width, height: header.height })
      if (content && view !== 'browser') {
        void api.reportContentRect({ x: content.x, y: content.y, width: content.width, height: content.height })
      }
    }
    report()
    const observer = new ResizeObserver(report)
    if (headerRef.current) observer.observe(headerRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [ready, headerVisible, bodyVisible, mini, view, settingsOpen, locked])

  const activeTab = useBrowserStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null)
  const panel = useBrowserStore((s) => s.panel)
  useEffect(() => {
    const visible = view === 'browser' && Boolean(activeTab?.url) && panel === 'none' && !settingsOpen && !locked
    void api.setBrowserVisible(visible)
  }, [view, activeTab?.url, panel, settingsOpen, locked])

  const setPopoverOverlay = (open: boolean) => {
    void api.reportPopover(open)
  }

  const pageActive = view === 'browser' && Boolean(activeTab?.url) && panel === 'none' && !settingsOpen && !locked
  const readerBook = useReaderStore((s) => s.books.find((book) => book.id === s.currentId) ?? null)
  const openNativeOverlay =
    (kind: 'opacity' | 'browser' | 'stealth' | 'fontcolor', context?: { readerFormat?: string | null }) =>
    (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      void api.openOverlay(kind, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, context)
    }

  const transparent = settings.window.renderMode === 'transparent'
  const bg = settings.window.background
  const imageMode = bg.type === 'image' && Boolean(backgroundUrl)
  const bgLayerStyle: React.CSSProperties = {
    backgroundImage: imageMode ? `url("${backgroundUrl}")` : undefined,
    opacity: imageMode ? (transparent ? Math.max(0, 1 - backgroundTransparency / 100) : 1) : 0,
  }
  const effectiveBgAlpha = bg.type === 'image' ? 0 : transparent ? Math.max(0, 100 - backgroundTransparency) : 100
  const rootStyle = {
    opacity: Math.max(0.01, opacity / 100),
    backgroundColor: transparent ? 'transparent' : bg.type === 'color' ? bg.color : '#f7f5f0',
    '--bg-alpha': `${effectiveBgAlpha}%`,
    ...(bg.type === 'color' ? { '--color-background': bg.color } : {}),
  } as React.CSSProperties

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        正在启动 偷闲有道…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'app-root',
        transparent && 'transparent-mode',
        !headerVisible && 'header-hidden',
        !bodyVisible && 'body-hidden',
        mini && 'mini-mode'
      )}
      style={rootStyle}
    >
      <div className="app-bg" style={bgLayerStyle} />
      <aside className="rail">
        <div className="rail-top">
          <img className="brand-dot" src={appLogo} alt="偷闲有道" title="偷闲有道" />
          <IconButton
            icon={<BookOpen className="size-[18px]" />}
            label="书架"
            active={view === 'library'}
            onClick={() => setView('library')}
          />
          <IconButton
            icon={<Globe2 className="size-[18px]" />}
            label="浏览"
            active={view === 'browser'}
            onClick={() => setView('browser')}
          />
          <IconButton
            icon={<Sparkles className="size-[18px]" />}
            label="AI 工具"
            active={view === 'ai'}
            onClick={() => setView('ai')}
          />
        </div>
        <div className="rail-bottom">
          <IconButton
            icon={<Palette className="size-[18px]" />}
            label="字体颜色"
            onClick={openNativeOverlay('fontcolor', { readerFormat: readerBook?.format ?? null })}
          />
          <IconButton
            icon={
              settings.browser.hideScrollbar ? (
                <PanelRightOpen className="size-[18px]" />
              ) : (
                <PanelRightClose className="size-[18px]" />
              )
            }
            label={settings.browser.hideScrollbar ? '显示网页滚动条' : '隐藏网页滚动条'}
            active={settings.browser.hideScrollbar}
            onClick={() => void patch({ browser: { hideScrollbar: !settings.browser.hideScrollbar } })}
          />
          <IconButton
            icon={<Lock className="size-[18px]" />}
            label="立即锁定"
            disabled={!lockEnabled}
            onClick={async () => {
              await api.lockNow()
            }}
          />
          <IconButton
            icon={<Settings className="size-[18px]" />}
            label="设置"
            onClick={() => openSettings('general')}
          />
        </div>
      </aside>

      <div className="main-column">
        <header ref={headerRef} className="toolbar">
          <div className="toolbar-title">
            <span className="app-name">偷闲有道</span>
            <span className="app-subtitle">{view === 'library' ? '书架' : view === 'ai' ? 'AI 工具' : '浏览'}</span>
          </div>
          <div className="no-drag toolbar-actions flex items-center gap-1">
            {pageActive ? (
              <button
                type="button"
                onClick={openNativeOverlay('opacity')}
                className="stealth-pill toolbar-priority-2"
                title="透明度"
              >
                <Contrast className="size-3.5" />
                <span className="tabular-nums">{Math.round(opacity)}%</span>
              </button>
            ) : (
              <Popover
                onOpenChange={setPopoverOverlay}
                trigger={({ toggle }) => (
                  <button type="button" onClick={toggle} className="stealth-pill toolbar-priority-2" title="透明度">
                    <Contrast className="size-3.5" />
                    <span className="tabular-nums">{Math.round(opacity)}%</span>
                  </button>
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>整体不透明度（含文字）</span>
                    <div className="flex gap-1" data-testid="opacity-presets">
                      {[0, 50, 100].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => void patch({ window: { opacity: value } })}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider
                    value={Math.round(opacity)}
                    min={0}
                    max={100}
                    onPreview={previewOpacity}
                    onCommit={(value) => void patch({ window: { opacity: value } })}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    100% = 完全可见；0% 保留极低可见度，确保仍可从托盘/老板键恢复。
                  </p>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>背景透明度（文字不变）</span>
                    <div className="flex gap-1" data-testid="bg-transparency-presets">
                      {[0, 50, 100].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => void patch({ window: { backgroundTransparency: value } })}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider
                    value={Math.round(backgroundTransparency)}
                    min={0}
                    max={100}
                    onPreview={previewBackgroundTransparency}
                    onCommit={(value) => void patch({ window: { backgroundTransparency: value } })}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    100% = 背景完全透明，文字保持不透明；0% = 背景完全不透明。
                  </p>
                </div>
              </Popover>
            )}

            <IconButton
              icon={settings.window.alwaysOnTop ? <Pin className="size-4" /> : <PinOff className="size-4" />}
              label={settings.window.alwaysOnTop ? '取消置顶' : '置顶窗口'}
              active={settings.window.alwaysOnTop}
              onClick={() => void patch({ window: { alwaysOnTop: !settings.window.alwaysOnTop } })}
              className="toolbar-priority-3"
            />

            <IconButton
              icon={<Blend className="size-4" />}
              label={transparent ? '切换为不透明模式' : '切换为透明模式'}
              active={transparent}
              onClick={() =>
                void patch({
                  window: { renderMode: transparent ? 'standard' : 'transparent' },
                  browser: { webTransparent: !transparent },
                })
              }
              className="toolbar-priority-3"
            />

            {pageActive ? (
              <IconButton
                icon={
                  settings.stealth.headerAutoHide || settings.stealth.bodyAutoHide ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )
                }
                label="自动隐藏"
                active={settings.stealth.headerAutoHide || settings.stealth.bodyAutoHide}
                onClick={openNativeOverlay('stealth')}
                className="toolbar-priority-4"
              />
            ) : (
              <Popover
                onOpenChange={setPopoverOverlay}
                trigger={({ toggle }) => (
                  <IconButton
                    icon={
                      settings.stealth.headerAutoHide || settings.stealth.bodyAutoHide ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )
                    }
                    label="自动隐藏"
                    active={settings.stealth.headerAutoHide || settings.stealth.bodyAutoHide}
                    onClick={toggle}
                    className="toolbar-priority-4"
                  />
                )}
                width="w-72"
              >
                <div className="space-y-3">
                  <Switch
                    checked={settings.stealth.headerAutoHide}
                    onChange={(value) => void patch({ stealth: { headerAutoHide: value } })}
                    label="鼠标移出时隐藏菜单栏"
                  />
                  <Switch
                    checked={settings.stealth.bodyAutoHide}
                    onChange={(value) => void patch({ stealth: { bodyAutoHide: value } })}
                    label="鼠标移出时隐藏主体"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    菜单栏和主体可独立隐藏；移回窗口或顶部热区即恢复。截屏保护在右侧盾牌按钮单独设置。
                  </p>
                </div>
              </Popover>
            )}

            <IconButton
              icon={settings.contentProtection ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
              label={settings.contentProtection ? '关闭截屏保护' : '开启截屏保护'}
              active={settings.contentProtection}
              onClick={() => void patch({ contentProtection: !settings.contentProtection })}
              className="toolbar-priority-4"
            />

            <IconButton
              icon={<Scaling className="size-4" />}
              label={mini ? '恢复窗口' : '迷你模式'}
              active={mini}
              onClick={async () => {
                const next = await api.setMini(!mini)
                setMini(Boolean(next))
              }}
              className="toolbar-priority-1"
            />

            <div className="toolbar-priority-1 ml-1 flex items-center gap-1 border-l border-border pl-1">
              <IconButton
                icon={<Minus className="size-4" />}
                label="最小化"
                onClick={() => void api.minimize()}
                size="sm"
              />
              <IconButton
                icon={maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                label={maximized ? '还原窗口' : '最大化'}
                onClick={async () => {
                  const next = await api.toggleMaximize()
                  setMaximized(Boolean(next))
                }}
                size="sm"
              />
              <IconButton
                icon={<X className="size-4" />}
                label={settings.window.closeAction === 'quit' ? '关闭并退出' : '隐藏到托盘'}
                onClick={() => void api.closeHide()}
                size="sm"
              />
            </div>
          </div>
        </header>

        <main ref={contentRef} className="content">
          <div className={cn('content-inner', view === 'library' ? 'block' : 'hidden')}>
            <ReaderView compact={mini} />
          </div>
          <div className={cn('content-inner', view === 'browser' ? 'block' : 'hidden')}>
            <BrowserView compact={mini} active={view === 'browser'} />
          </div>
          <div className={cn('content-inner', view === 'ai' ? 'block' : 'hidden')}>
            <AiTools />
          </div>
        </main>
      </div>

      <SettingsPanel open={settingsOpen} initialTab={settingsTab} onClose={() => setSettingsOpen(false)} />
      {locked && <LockScreen onUnlocked={() => setLocked(false)} />}
      <ToastViewport />
    </div>
  )
}
