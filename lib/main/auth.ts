import type { AuthSession } from '../shared/types'

export interface AuthService {
  readonly enabled: boolean
  readonly mode: 'disabled' | 'mock' | 'http'
  getSession(): Promise<AuthSession>
  login(email: string, password: string): Promise<AuthSession>
  logout(): Promise<void>
}

const emptySession = (): AuthSession => ({ userId: null, displayName: null, token: null })

/** 默认实现：不启用登录，全功能本地可用。 */
export class DisabledAuthService implements AuthService {
  readonly enabled = false
  readonly mode = 'disabled' as const
  async getSession(): Promise<AuthSession> {
    return emptySession()
  }
  async login(): Promise<AuthSession> {
    throw new Error('AUTH_DISABLED')
  }
  async logout(): Promise<void> {
    /* no-op */
  }
}

/** 预留的本地 mock：仅用于未来接入账号体系时做联调。 */
export class MockAuthService implements AuthService {
  readonly enabled = true
  readonly mode = 'mock' as const
  private session: AuthSession = emptySession()
  async getSession(): Promise<AuthSession> {
    return this.session
  }
  async login(email: string, password: string): Promise<AuthSession> {
    if (!email || !password) throw new Error('AUTH_INVALID_INPUT')
    this.session = { userId: 'mock-user', displayName: email.split('@')[0] || 'reader', token: 'mock-token' }
    return this.session
  }
  async logout(): Promise<void> {
    this.session = emptySession()
  }
}

/** 未来 HTTP 实现占位：当前不发起任何网络请求。 */
export class HttpAuthService implements AuthService {
  readonly enabled = true
  readonly mode = 'http' as const
  constructor(private readonly baseUrl: string) {}
  async getSession(): Promise<AuthSession> {
    throw new Error(`AUTH_HTTP_NOT_IMPLEMENTED:${this.baseUrl}`)
  }
  async login(): Promise<AuthSession> {
    throw new Error('AUTH_HTTP_NOT_IMPLEMENTED')
  }
  async logout(): Promise<void> {
    /* no-op */
  }
}

let service: AuthService = new DisabledAuthService()

export function configureAuth(enabled: boolean, mode: 'mock' | 'http', baseUrl = ''): AuthService {
  if (!enabled) service = new DisabledAuthService()
  else if (mode === 'http') service = new HttpAuthService(baseUrl)
  else service = new MockAuthService()
  return service
}

export function getAuthService(): AuthService {
  return service
}
