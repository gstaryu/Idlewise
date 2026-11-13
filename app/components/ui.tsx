import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/app/lib/cn'
import { useAppStore } from '@/app/store'

export function IconButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  className,
  size = 'md',
}: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center rounded-lg transition-colors',
        size === 'sm' ? 'size-7' : 'size-9',
        active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        disabled && 'pointer-events-none opacity-40',
        className
      )}
    >
      {icon}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-center gap-2.5 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-primary bg-primary' : 'border-border bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
      {label && <span className="select-none">{label}</span>}
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  onPreview,
  onCommit,
}: {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange?: (value: number) => void
  onPreview?: (value: number) => void
  onCommit?: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums text-foreground">
            {value}
            {suffix}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (onPreview) onPreview(next)
          else onChange?.(next)
        }}
        onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        className="h-1.5 w-full cursor-pointer accent-primary"
      />
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            value === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  onEnter,
  type = 'text',
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  onEnter?: () => void
  type?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.()
      }}
      className={cn(
        'h-8 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15',
        className
      )}
    />
  )
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-24 rounded-lg border border-border bg-card px-2 text-xs uppercase outline-none focus:border-primary/60"
        />
      </div>
    </div>
  )
}

let activePopoverCloser: (() => void) | null = null

export function Popover({
  trigger,
  children,
  align = 'end',
  width = 'w-64',
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  width?: string
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, right: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    onOpenChange?.(open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    if (activePopoverCloser && activePopoverCloser !== close) activePopoverCloser()
    activePopoverCloser = close
    const layout = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({
        top: Math.min(rect.bottom + 8, window.innerHeight - 80),
        left: rect.left,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    layout()
    window.addEventListener('resize', layout)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', layout)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
      if (activePopoverCloser === close) activePopoverCloser = null
    }
  }, [open])
  return (
    <div className="no-drag relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <>
            <div className="popover-backdrop" />
            <div
              ref={panelRef}
              className={cn(
                'no-drag popover-panel fixed z-[70] max-h-[calc(100vh-120px)] overflow-auto rounded-xl border border-border bg-popover p-3 shadow-xl',
                width
              )}
              style={align === 'end' ? { top: pos.top, right: pos.right } : { top: pos.top, left: pos.left }}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('.menu-item, [data-popover-close]')) setOpen(false)
              }}
            >
              {children}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
      <div
        className={cn(
          'flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton icon={<X className="size-4" />} label="关闭" onClick={onClose} size="sm" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed top-2 left-1/2 z-[120] flex max-w-[80vw] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={cn(
            'pointer-events-auto rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur',
            toast.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : toast.kind === 'success'
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-card/90 text-foreground'
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border/70 pb-5 last:border-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
