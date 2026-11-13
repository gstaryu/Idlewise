import { useEffect, useState } from 'react'
import { Image as ImageIcon, KeyRound, LockKeyhole, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { api } from '@/app/lib/api'
import { useAppStore } from '@/app/store'
import { ColorField, Field, Modal, Section, Segmented, Switch, TextInput } from '@/app/components/ui'

const TABS = [
  { key: 'general', label: '通用' },
  { key: 'window', label: '窗口' },
  { key: 'stealth', label: '隐蔽' },
  { key: 'security', label: '安全' },
  { key: 'about', label: '关于' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SettingsPanel({
  open,
  onClose,
  initialTab = 'general',
}: {
  open: boolean
  onClose: () => void
  initialTab?: TabKey
}) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title="设置" wide>
      <div data-testid="settings-panel" className="flex h-[600px] max-h-[calc(88vh-120px)] min-h-0 gap-5">
        <nav className="flex w-28 shrink-0 flex-col gap-1 overflow-y-auto">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm transition-colors',
                tab === item.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div data-testid="settings-scroll" className="min-w-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {tab === 'general' && <GeneralTab />}
          {tab === 'window' && <WindowTab />}
          {tab === 'stealth' && <StealthTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </Modal>
  )
}

function GeneralTab() {
  const settings = useAppStore((s) => s.settings)
  const patch = useAppStore((s) => s.patch)
  const reset = useAppStore((s) => s.toast)
  const [info, setInfo] = useState<any>(null)
  useEffect(() => {
    void api.appInfo().then(setInfo)
  }, [])
  return (
    <>
      <Section title="启动与外观">
        <Field label="上次窗口尺寸">
          <span className="text-xs text-muted-foreground">
            {settings.window.defaultSize.width} × {settings.window.defaultSize.height}
          </span>
        </Field>
        <Field label="当前渲染模式">
          <span className="text-xs text-muted-foreground">
            {settings.window.renderMode === 'transparent' ? '透明模式' : '标准模式'}
          </span>
        </Field>
        <Field label="始终置顶">
          <Switch
            checked={settings.window.alwaysOnTop}
            onChange={(value) => void patch({ window: { alwaysOnTop: value } })}
          />
        </Field>
      </Section>
      <Section title="数据">
        <Field label="用户数据目录">
          <button type="button" className="btn-secondary" onClick={() => void api.openUserData()}>
            打开
          </button>
        </Field>
        <p className="break-all text-[11px] text-muted-foreground">{info?.userData ?? '读取中…'}</p>
      </Section>
      <Section title="维护">
        <Field label="恢复默认设置">
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              await api.resetSettings()
              reset('已恢复默认设置', 'success')
            }}
          >
            <RotateCcw className="size-3.5" /> 恢复
          </button>
        </Field>
        <Field label="退出应用">
          <button type="button" className="btn-danger" onClick={() => void api.quit()}>
            退出
          </button>
        </Field>
      </Section>
    </>
  )
}

function WindowTab() {
  const settings = useAppStore((s) => s.settings)
  const patch = useAppStore((s) => s.patch)
  const toast = useAppStore((s) => s.toast)
  const [width, setWidth] = useState(String(settings.window.defaultSize.width))
  const [height, setHeight] = useState(String(settings.window.defaultSize.height))

  useEffect(() => {
    setWidth(String(settings.window.defaultSize.width))
    setHeight(String(settings.window.defaultSize.height))
  }, [settings.window.defaultSize.width, settings.window.defaultSize.height])

  return (
    <>
      <Section title="关闭按钮">
        <Segmented
          value={settings.window.closeAction}
          options={[
            { value: 'tray', label: '隐藏到托盘' },
            { value: 'quit', label: '直接退出' },
          ]}
          onChange={(value) => void patch({ window: { closeAction: value } })}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">关闭按钮与 Alt+F4 都按此设置执行。</p>
      </Section>
      <Section title="默认尺寸">
        <div className="flex flex-wrap gap-1.5">
          {[
            [420, 600],
            [560, 760],
            [800, 600],
            [1040, 760],
          ].map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              type="button"
              className="chip"
              onClick={() => {
                setWidth(String(w))
                setHeight(String(h))
                void api.setDefaultSize(w, h)
              }}
            >
              {w} × {h}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1 space-y-1 text-xs text-muted-foreground">
            宽
            <TextInput value={width} onChange={setWidth} />
          </label>
          <label className="flex-1 space-y-1 text-xs text-muted-foreground">
            高
            <TextInput value={height} onChange={setHeight} />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const w = Number(width)
              const h = Number(height)
              if (!Number.isFinite(w) || !Number.isFinite(h)) return
              await api.setDefaultSize(w, h)
              toast('已应用默认尺寸', 'success')
            }}
          >
            应用
          </button>
        </div>
      </Section>
      <Section title="自定义背景">
        <div className="flex items-center justify-between">
          <span className="text-sm">背景类型</span>
          <Segmented
            value={settings.window.background.type}
            options={[
              { value: 'transparent', label: '透明' },
              { value: 'color', label: '纯色' },
              { value: 'image', label: '图片' },
            ]}
            onChange={(value) => void patch({ window: { background: { type: value } } })}
          />
        </div>
        {settings.window.background.type === 'color' && (
          <ColorField
            label="背景颜色"
            value={settings.window.background.color}
            onChange={(value) => void api.setBackgroundColor(value)}
          />
        )}
        {settings.window.background.type === 'image' && (
          <div className="flex items-center justify-between">
            <span className="text-sm">背景图片</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => void api.pickBackground()}>
                <ImageIcon className="size-3.5" /> 更换图片
              </button>
              <button type="button" className="btn-secondary" onClick={() => void api.clearBackground()}>
                清除
              </button>
            </div>
          </div>
        )}
        {settings.window.background.type === 'transparent' && (
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">背景保持透明，桌面会透出；可随时切换纯色或图片。</p>
            <button type="button" className="btn-secondary" onClick={() => void api.pickBackground()}>
              <ImageIcon className="size-3.5" /> 选择图片
            </button>
          </div>
        )}
        {settings.window.background.type === 'image' && (
          <p className="truncate text-[11px] text-muted-foreground">当前：{settings.window.background.imagePath}</p>
        )}
      </Section>
    </>
  )
}

function StealthTab() {
  const settings = useAppStore((s) => s.settings)
  const patch = useAppStore((s) => s.patch)
  const bossStatus = useAppStore((s) => s.bossStatus)
  const toast = useAppStore((s) => s.toast)
  const [toggleKey, setToggleKey] = useState(settings.bossKey.toggleKey)
  const [hideKey, setHideKey] = useState(settings.bossKey.hideKey)

  useEffect(() => {
    setToggleKey(settings.bossKey.toggleKey)
    setHideKey(settings.bossKey.hideKey)
  }, [settings.bossKey.toggleKey, settings.bossKey.hideKey])

  return (
    <>
      <Section title="任务栏">
        <Switch
          checked={settings.stealth.hideTaskbarIcon}
          onChange={(value) => void patch({ stealth: { hideTaskbarIcon: value } })}
          label="隐藏任务栏图标（同时从 Alt+Tab 隐藏）"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          隐藏后仍可通过托盘、老板键或顶部热区唤回。自动隐藏与截屏保护在主界面顶部按钮中设置。
        </p>
      </Section>
      <Section title="老板键">
        <Switch
          checked={settings.bossKey.enabled}
          onChange={(value) => void patch({ bossKey: { enabled: value } })}
          label="启用全局快捷键"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            最小化 / 恢复
            <TextInput value={toggleKey} onChange={setToggleKey} placeholder="Alt+Z" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            隐藏到后台
            <TextInput value={hideKey} onChange={setHideKey} placeholder="Alt+X" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const status = await api.setBossKeys({ enabled: settings.bossKey.enabled, toggleKey, hideKey })
              toast(status.ok ? '老板键已生效' : status.message || '快捷键注册失败', status.ok ? 'success' : 'error')
            }}
          >
            <KeyRound className="size-3.5" /> 应用快捷键
          </button>
          <span className={cn('text-[11px]', bossStatus.ok ? 'text-muted-foreground' : 'text-destructive')}>
            {bossStatus.ok ? `${bossStatus.toggleKey} / ${bossStatus.hideKey}` : bossStatus.message}
          </span>
        </div>
      </Section>
      <Section title="托盘">
        <div className="flex items-center justify-between">
          <span className="text-sm">托盘图标</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => void api.pickTrayIcon()}>
              <ImageIcon className="size-3.5" /> 更换
            </button>
            <button type="button" className="btn-secondary" onClick={() => void api.resetTrayIcon()}>
              还原
            </button>
          </div>
        </div>
        <Switch
          checked={settings.tray.hideTooltip}
          onChange={(value) => void api.setTrayTooltipHidden(value)}
          label="不显示托盘悬停文字"
        />
      </Section>
    </>
  )
}

function SecurityTab() {
  const settings = useAppStore((s) => s.settings)
  const setLocked = useAppStore((s) => s.setLocked)
  const toast = useAppStore((s) => s.toast)
  const [enabled, setEnabled] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentPin, setCurrentPin] = useState('')

  useEffect(() => {
    void api.lockStatus().then((status) => setEnabled(status.enabled))
  }, [])

  return (
    <>
      <Section title="密码锁">
        <div className="flex items-center justify-between">
          <span className="text-sm">状态</span>
          <span className={cn('text-xs', enabled ? 'text-primary' : 'text-muted-foreground')}>
            {enabled ? '已设置密码' : '未设置密码'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            新密码（4–8 位数字）
            <TextInput value={pin} onChange={setPin} type="password" placeholder="••••" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            确认密码
            <TextInput value={confirm} onChange={setConfirm} type="password" placeholder="••••" />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              if (pin !== confirm) {
                toast('两次输入的密码不一致', 'error')
                return
              }
              const result = await api.setPin(pin)
              if (result.ok) {
                setEnabled(true)
                setPin('')
                setConfirm('')
                toast('密码已设置', 'success')
              } else {
                toast(result.message || '设置失败', 'error')
              }
            }}
          >
            <LockKeyhole className="size-3.5" /> {enabled ? '修改密码' : '设置密码'}
          </button>
          {enabled && (
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                if (!currentPin) {
                  toast('请输入当前密码', 'error')
                  return
                }
                const result = await api.disablePin(currentPin)
                if (result.ok) {
                  setEnabled(false)
                  setCurrentPin('')
                  toast('密码已关闭', 'success')
                } else {
                  toast('密码不正确', 'error')
                }
              }}
            >
              <Trash2 className="size-3.5" /> 关闭密码锁
            </button>
          )}
        </div>
        {enabled && (
          <label className="space-y-1 text-xs text-muted-foreground">
            当前密码（关闭时需要）
            <TextInput value={currentPin} onChange={setCurrentPin} type="password" placeholder="••••" />
          </label>
        )}
        <Switch
          checked={settings.lock.lockOnStartup}
          onChange={(value) => void api.setLockOnStartup(value)}
          label="启动时锁定"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!enabled}
            onClick={async () => {
              const status = await api.lockNow()
              setLocked(status.locked)
            }}
          >
            <ShieldCheck className="size-3.5" /> 立即锁定
          </button>
        </div>
      </Section>
    </>
  )
}

function AboutTab() {
  const [info, setInfo] = useState<any>(null)
  useEffect(() => {
    void api.appInfo().then(setInfo)
  }, [])
  return (
    <>
      <Section title="偷闲有道">
        <p className="text-sm font-semibold">隐蔽阅读器</p>
        <p className="text-xs text-muted-foreground">
          透明置顶、老板键、密码锁、截屏保护，内置多标签浏览器与本地电子书阅读器。
        </p>
      </Section>
      <Section title="版本信息">
        <Field label="版本">
          <span className="text-xs text-muted-foreground">{info?.version ?? '—'}</span>
        </Field>
        <Field label="Electron">
          <span className="text-xs text-muted-foreground">{info?.electron ?? '—'}</span>
        </Field>
        <Field label="Chromium">
          <span className="text-xs text-muted-foreground">{info?.chrome ?? '—'}</span>
        </Field>
        <Field label="运行模式">
          <span className="text-xs text-muted-foreground">{info?.packaged ? '安装版' : '开发版'}</span>
        </Field>
      </Section>
    </>
  )
}
