import { randomUUID } from 'crypto'
import { existsSync, writeFileSync } from 'fs'
import type { MySite } from '../shared/types'
import { dataFile, readJson, writeJsonAtomic, writeJsonSyncAtomic } from './store'
import { toUrl } from '../shared/utils'

const file = () => dataFile('sites.json')
const seedMarker = () => dataFile('sites.seeded-v3')
let cache: MySite[] | null = null

const SEED: MySite[] = [
  { id: 'seed-fenbi', name: '粉笔网', url: 'https://www.fenbi.com', compat: false },
  { id: 'seed-douban', name: '豆瓣', url: 'https://www.douban.com/', compat: false },
  { id: 'seed-bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com/', compat: false },
  { id: 'seed-jianshu', name: '简书', url: 'https://www.jianshu.com/', compat: false },
  { id: 'seed-juejin', name: '掘金', url: 'https://juejin.cn/', compat: false },
  { id: 'seed-zhihu', name: '知乎', url: 'https://www.zhihu.com/', compat: true },
  { id: 'seed-weread', name: '微信读书', url: 'https://weread.qq.com', compat: true },
]

function load(): MySite[] {
  if (!cache) {
    const raw = readJson<MySite[] | null>(file(), null)
    if (Array.isArray(raw)) {
      cache = raw.filter((x) => x && typeof x.url === 'string')
      if (!existsSync(seedMarker())) {
        const missing = SEED.filter((seed) => !cache!.some((site) => site.id === seed.id))
        if (missing.length) {
          cache.push(...missing.map((seed) => ({ ...seed })))
          save()
        }
        try {
          writeFileSync(seedMarker(), new Date().toISOString())
        } catch {
          /* ignore */
        }
      }
    } else {
      cache = SEED.map((x) => ({ ...x }))
      save()
    }
  }
  return cache
}

function save(): void {
  void writeJsonAtomic(file(), cache ?? [])
}

export function listSites(): MySite[] {
  return [...load()]
}

export function addSite(name: string, url: string, compat = false): MySite[] {
  const normalized = toUrl(url)
  if (!normalized) return listSites()
  const list = load()
  const site: MySite = {
    id: randomUUID(),
    name: name.trim() || normalized.replace(/^https?:\/\//, '').split('/')[0],
    url: normalized,
    compat,
  }
  list.push(site)
  save()
  return [...list]
}

export function updateSite(id: string, patch: Partial<Pick<MySite, 'name' | 'url' | 'compat'>>): MySite[] {
  const list = load()
  const site = list.find((x) => x.id === id)
  if (site) {
    if (patch.name !== undefined) site.name = patch.name.trim() || site.name
    if (patch.url !== undefined) site.url = toUrl(patch.url) || site.url
    if (patch.compat !== undefined) site.compat = Boolean(patch.compat)
    save()
  }
  return [...list]
}

export function removeSite(id: string): MySite[] {
  cache = load().filter((x) => x.id !== id)
  save()
  return [...cache]
}

export function flushSites(): void {
  writeJsonSyncAtomic(file(), cache ?? [])
}
