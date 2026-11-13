import { app, safeStorage } from 'electron'
import { join } from 'path'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import fse from 'fs-extra'
import type { LockStatus } from '../shared/types'
import { runtime } from './state'
import { userDataDir } from './store'

interface Stored {
  salt: string
  hash: string
}

const lockFile = () => join(userDataDir(), 'lock.bin')

let failed = 0
let blockedUntil = 0

function derive(pin: string, saltHex: string): Buffer {
  return scryptSync(pin, Buffer.from(saltHex, 'hex'), 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
}

export const lock = {
  isEnabled(): boolean {
    return fse.existsSync(lockFile())
  },

  setPin(pin: string): { ok: boolean; message?: string } {
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: '密码需为 4–8 位数字' }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: '当前系统不支持安全存储' }
    const salt = randomBytes(16).toString('hex')
    const hash = derive(pin, salt).toString('hex')
    const encrypted = safeStorage.encryptString(JSON.stringify({ salt, hash } satisfies Stored))
    fse.ensureDirSync(userDataDir())
    fse.writeFileSync(lockFile(), encrypted)
    failed = 0
    blockedUntil = 0
    return { ok: true }
  },

  verify(pin: string): boolean {
    const now = Date.now()
    if (now < blockedUntil) return false
    try {
      const encrypted = fse.readFileSync(lockFile())
      const { salt, hash } = JSON.parse(safeStorage.decryptString(encrypted)) as Stored
      const candidate = derive(pin, salt)
      const expected = Buffer.from(hash, 'hex')
      const ok = candidate.length === expected.length && timingSafeEqual(candidate, expected)
      if (ok) {
        failed = 0
        blockedUntil = 0
      } else {
        failed += 1
        if (failed >= 5) {
          blockedUntil = Date.now() + Math.min(30000, 2 ** Math.min(5, failed - 5) * 1000)
        }
      }
      return ok
    } catch {
      return false
    }
  },

  disable(pin: string): boolean {
    if (!this.verify(pin)) return false
    try {
      fse.removeSync(lockFile())
      runtime.locked = false
      return true
    } catch {
      return false
    }
  },

  status(): LockStatus {
    return { enabled: this.isEnabled(), locked: runtime.locked }
  },

  lockNow(): LockStatus {
    if (!this.isEnabled()) return this.status()
    runtime.locked = true
    runtime.tabs?.setLocked(true)
    this.broadcast()
    return this.status()
  },

  unlock(pin: string): LockStatus {
    if (!this.isEnabled()) {
      runtime.locked = false
      this.broadcast()
      return this.status()
    }
    if (this.verify(pin)) {
      runtime.locked = false
      runtime.tabs?.setLocked(false)
      this.broadcast()
    }
    return this.status()
  },

  lockOnStartupIfNeeded(): void {
    if (app.isPackaged) {
      /* no-op */
    }
    if (!this.isEnabled()) return
    /* 由 main 在读取设置后决定是否锁 */
  },

  broadcast(): void {
    runtime.win?.webContents.send('lock:changed', this.status())
  },
}
