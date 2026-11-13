export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** 0–100 的无极透明度 → 原生窗口 alpha。0% 保留 1% 以免完全失去可操作性。 */
export function opacityToNative(percent: number): number {
  const p = clamp(Number(percent) || 0, 0, 100)
  return clamp(p / 100, 0.01, 1)
}

/** 0–100 的无极透明度 → 渲染层 CSS alpha。 */
export function opacityToCss(percent: number): number {
  return opacityToNative(percent)
}

/** 地址栏输入规范化：URL 原样，域名补 https，其它走 Bing 搜索。 */
export function toUrl(input: string): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^(https?|file|idlewise-asset):/i.test(raw)) return raw
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(raw)) return `http://${raw}`
  if (/\s/.test(raw)) return `https://www.bing.com/search?q=${encodeURIComponent(raw)}`
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(raw)) return `https://${raw}`
  return `https://www.bing.com/search?q=${encodeURIComponent(raw)}`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** 完整 Chrome UA，去掉 Electron 标识，避免站点拒绝或降级。 */
export function chromeUserAgent(chromeVersion: string, mobile = false): string {
  const platform = mobile ? 'Linux; Android 13; Pixel 7' : 'Windows NT 10.0; Win64; x64'
  const mobileToken = mobile ? ' Mobile' : ''
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}${mobileToken} Safari/537.36`
}

export function isCompleteUserAgent(ua: string): boolean {
  return /Mozilla\/5\.0/.test(ua) && /Chrome\/\d+/.test(ua)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
