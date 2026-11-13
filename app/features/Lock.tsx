import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { api } from '@/app/lib/api'
import { useAppStore } from '@/app/store'

export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const toast = useAppStore((s) => s.toast)

  const submit = async () => {
    if (!pin || busy) return
    setBusy(true)
    setError('')
    try {
      const status = await api.unlock(pin)
      if (status.locked) {
        setError('密码不正确')
        setShake(true)
        setTimeout(() => setShake(false), 400)
        setPin('')
      } else {
        toast('已解锁', 'success')
        onUnlocked()
      }
    } catch (err) {
      setError('解锁失败，请稍后再试')
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-screen">
      <div className={shake ? 'lock-card shake' : 'lock-card'}>
        <div className="lock-icon">
          <LockKeyhole className="size-6" />
        </div>
        <h1 className="text-base font-semibold">偷闲有道已锁定</h1>
        <p className="text-xs text-muted-foreground">输入密码后继续阅读</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          maxLength={8}
          placeholder="••••"
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
          className="lock-input"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button type="button" className="btn-primary w-full" disabled={busy || !pin} onClick={() => void submit()}>
          {busy ? '验证中…' : '解锁'}
        </button>
        <p className="text-[11px] text-muted-foreground">密码完全保存在本机，不上传任何服务器。</p>
      </div>
    </div>
  )
}
