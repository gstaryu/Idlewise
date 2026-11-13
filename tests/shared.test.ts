import { describe, expect, it } from 'vitest'
import { chromeUserAgent, formatBytes, hostOf, opacityToCss, opacityToNative, toUrl } from '@/lib/shared/utils'
import { createDefaultSettings, mergeDeep, sanitizeSettings } from '@/lib/shared/settings'
import { decodeText, escapeHtml, findTextMatches, parseChapters, stripBlankLines } from '@/lib/shared/text'
import { DisabledAuthService, HttpAuthService, MockAuthService } from '@/lib/main/auth'

describe('opacity mapping', () => {
  it('maps 0/50/100 to safe alpha values', () => {
    expect(opacityToNative(0)).toBe(0.01)
    expect(opacityToNative(50)).toBe(0.5)
    expect(opacityToNative(100)).toBe(1)
    expect(opacityToCss(0)).toBe(0.01)
    expect(opacityToCss(50)).toBe(0.5)
  })

  it('clamps out-of-range values', () => {
    expect(opacityToNative(-20)).toBe(0.01)
    expect(opacityToNative(250)).toBe(1)
    expect(opacityToNative(Number.NaN)).toBe(0.01)
  })
})

describe('url normalization', () => {
  it('keeps explicit protocols', () => {
    expect(toUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(toUrl('file:///D:/a.txt')).toBe('file:///D:/a.txt')
  })
  it('adds https to domains and http to localhost', () => {
    expect(toUrl('example.com')).toBe('https://example.com')
    expect(toUrl('127.0.0.1:8123/page.html')).toBe('http://127.0.0.1:8123/page.html')
    expect(toUrl('localhost:3000')).toBe('http://localhost:3000')
  })
  it('turns plain text into a Bing search', () => {
    expect(toUrl('隐蔽 阅读')).toBe(`https://www.bing.com/search?q=${encodeURIComponent('隐蔽 阅读')}`)
    expect(hostOf('https://Example.com/x')).toBe('example.com')
  })
})

describe('settings merge and sanitize', () => {
  it('deep merges nested objects but replaces arrays', () => {
    const merged = mergeDeep(createDefaultSettings(), {
      window: { opacity: 40 },
      browser: { compatHosts: ['a.com'] },
    })
    expect(merged.window.opacity).toBe(40)
    expect(merged.window.defaultSize.width).toBe(createDefaultSettings().window.defaultSize.width)
    expect(merged.browser.compatHosts).toEqual(['a.com'])
  })

  it('sanitizes corrupted input and clamps ranges', () => {
    const settings = sanitizeSettings({
      window: { opacity: 999, renderMode: 'weird', defaultSize: { width: -1, height: 0 } },
      reader: { fontSize: 200, lineHeight: -2, flow: 'bad' },
      browser: { zoom: 1000, compatHosts: 'nope' },
      auth: { enabled: true, mode: 'x' },
    })
    expect(settings.window.opacity).toBe(100)
    expect(settings.window.renderMode).toBe('transparent')
    expect(settings.window.defaultSize.width).toBeGreaterThanOrEqual(320)
    expect(settings.reader.fontSize).toBe(48)
    expect(settings.reader.lineHeight).toBe(1)
    expect(settings.reader.flow).toBe('scrolled')
    expect(settings.browser.zoom).toBe(200)
    expect(settings.browser.compatHosts).toEqual([])
    expect(settings.auth.mode).toBe('mock')
  })
})

describe('text utilities', () => {
  const sample = `书名：测试\n作者：偷闲有道\n\n第一章 初见\n\n夜色渐深。\n\n第二章 夜读\n\n雨下了一夜。\n\n第三章 清晨\n\n天亮了。\n`

  it('parses Chinese chapters', () => {
    const chapters = parseChapters(sample)
    expect(chapters.map((c) => c.title)).toEqual(['开头', '第一章 初见', '第二章 夜读', '第三章 清晨'])
    expect(chapters[1].body).toContain('夜色渐深')
  })

  it('falls back to a single chapter when no headings exist', () => {
    const chapters = parseChapters('只有一段普通文字。\n没有章节标题。')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('正文')
  })

  it('strips blank lines', () => {
    expect(stripBlankLines('a\n\n\nb\n  \nc')).toBe('a\nb\nc')
  })

  it('finds matches with previews', () => {
    const matches = findTextMatches('林舟读书，林舟写字。', '林舟')
    expect(matches).toHaveLength(2)
    expect(matches[0].index).toBe(0)
    expect(matches[1].index).toBe(5)
    expect(matches[0].preview).toContain('林舟')
  })

  it('decodes UTF-8 and escapes HTML', () => {
    expect(decodeText(new TextEncoder().encode('隐蔽阅读'))).toBe('隐蔽阅读')
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
})

describe('auth abstraction', () => {
  it('disabled service returns an empty session and rejects login', async () => {
    const service = new DisabledAuthService()
    expect(service.enabled).toBe(false)
    expect(await service.getSession()).toEqual({ userId: null, displayName: null, token: null })
    await expect(service.login('a@b.c', 'x')).rejects.toThrow('AUTH_DISABLED')
  })

  it('mock service can login and logout', async () => {
    const service = new MockAuthService()
    const session = await service.login('reader@example.com', 'secret')
    expect(session.userId).toBe('mock-user')
    expect(session.displayName).toBe('reader')
    await service.logout()
    expect((await service.getSession()).userId).toBeNull()
  })

  it('http service is an explicit placeholder', async () => {
    const service = new HttpAuthService('https://example.invalid')
    await expect(service.getSession()).rejects.toThrow('AUTH_HTTP_NOT_IMPLEMENTED')
  })
})

describe('misc formatting', () => {
  it('formats bytes and user agents', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(chromeUserAgent('140', false)).toContain('Windows NT 10.0')
    expect(chromeUserAgent('140', true)).toContain('Android 13')
    expect(chromeUserAgent('140', true)).toContain('Mobile')
  })
})
