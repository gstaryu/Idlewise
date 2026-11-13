export interface Chapter {
  title: string
  body: string
}

const CHAPTER_RE =
  /^[ \t\u3000]*(第\s*[0-9零〇一二三四五六七八九十百千两]+\s*[章回节卷部篇集]|序章|序言|序|楔子|引子|前言|尾声|后记|番外[篇章]?|终章)[^\n]{0,30}$/

/** 识别常见中文章节标题；识别不到两章以上就当作整本一章。 */
export function parseChapters(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []
  let current: Chapter | null = null
  const preface: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0 && trimmed.length <= 40 && CHAPTER_RE.test(trimmed)) {
      if (current) chapters.push(current)
      current = { title: trimmed, body: '' }
    } else if (current) {
      current.body += `${line}\n`
    } else {
      preface.push(line)
    }
  }
  if (current) chapters.push(current)
  if (chapters.length < 2) return [{ title: '正文', body: text }]
  const pre = preface.join('\n').trim()
  if (pre) chapters.unshift({ title: '开头', body: pre })
  return chapters
}

/** 去除纯空行与只含空白的行，保留段落结构。 */
export function stripBlankLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .join('\n')
}

/** 中文 TXT 常见 GB18030；UTF-8 替换字符过多时回退。 */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const bad = (utf8.match(/�/g) || []).length
  if (bad > Math.max(3, utf8.length * 0.002)) {
    try {
      return new TextDecoder('gb18030').decode(bytes)
    } catch {
      return utf8
    }
  }
  return utf8
}

export interface TextMatch {
  index: number
  length: number
  preview: string
}

export function findTextMatches(text: string, query: string, limit = 200): TextMatch[] {
  const q = query.trim()
  if (!q) return []
  const haystack = text.toLocaleLowerCase()
  const needle = q.toLocaleLowerCase()
  const out: TextMatch[] = []
  let at = haystack.indexOf(needle)
  while (at >= 0 && out.length < limit) {
    const start = Math.max(0, at - 30)
    const end = Math.min(text.length, at + q.length + 30)
    out.push({
      index: at,
      length: q.length,
      preview: `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`,
    })
    at = haystack.indexOf(needle, at + Math.max(1, q.length))
  }
  return out
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
