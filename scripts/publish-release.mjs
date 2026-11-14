import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const tag = `v${version}`
const dryRun = process.argv.includes('--dry-run')
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

function detectRepo() {
  if (process.env.GITHUB_REPOSITORY?.includes('/')) return process.env.GITHUB_REPOSITORY
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim()
    const match = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
    if (match) return `${match[1]}/${match[2].replace(/\.git$/, '')}`
  } catch {
    /* ignore */
  }
  return null
}

function releaseBody() {
  return `## 偷闲有道 ${tag}

首个正式版，Windows 10/11 x64。

### 下载

**推荐使用便携版**：\`idlewise-${version}-portable.exe\`
免安装，下载后直接运行；首次启动会解压到临时目录，约 4–5 秒。

也可使用安装版：\`idlewise-${version}-setup.exe\`
支持选择“所有用户 / 仅为我安装”，并可修改安装目录。

### 本次亮点

- 透明置顶、鼠标移开自动隐藏、老板键、密码锁、截屏保护
- 多标签浏览器：网页透明（仅保留文字）、网页文字颜色、隐藏滚动条、缩放、手机 UA、视频倍速、按站点兼容模式
- 历史/收藏以标签页打开；中键关闭标签、中键链接打开新标签
- 本地阅读器：PDF / EPUB / MOBI / AZW3 / TXT，目录、搜索、自动翻页/滚动、进度恢复
- AI 工具一级入口：豆包、DeepSeek、Kimi、元宝、智谱、ChatGPT

### 安装 / 运行

- **推荐便携版**：下载后直接运行，无需安装。
- 安装版：按向导选择安装范围与目录。
- 未配置代码签名证书，首次运行可能出现 SmartScreen 提示。

### 系统要求

- Windows 10/11 x64
- 建议预留 400MB 磁盘空间`
}

const files = [
  path.join(root, 'dist', `idlewise-${version}-setup.exe`),
  path.join(root, 'dist', `idlewise-${version}-portable.exe`),
  path.join(root, 'dist', `idlewise-${version}-setup.exe.blockmap`),
].filter((file) => fs.existsSync(file))

const slug = detectRepo()
const missingRequired = [
  path.join(root, 'dist', `idlewise-${version}-setup.exe`),
  path.join(root, 'dist', `idlewise-${version}-portable.exe`),
].filter((file) => !fs.existsSync(file))

console.log(`repository: ${slug ?? '(not detected)'}`)
console.log(`release:     偷闲有道 ${tag}`)
for (const file of files) {
  console.log(`asset:       ${path.relative(root, file)} (${fs.statSync(file).size} bytes)`)
}

if (missingRequired.length) {
  console.error('\n缺少构建产物，请先运行 npm run build:win：')
  for (const file of missingRequired) console.error(`- ${path.relative(root, file)}`)
  process.exit(1)
}

if (dryRun) {
  console.log('\n[dry-run] 未调用 GitHub API。设置 GITHUB_TOKEN 后去掉 --dry-run 即可发布。')
  process.exit(0)
}

if (!token) {
  console.error('\n缺少 GITHUB_TOKEN 或 GH_TOKEN。')
  console.error('请创建 fine-grained token，并授予目标仓库 Contents: Read and write。')
  process.exit(1)
}
if (!slug) {
  console.error('\n无法确定 GitHub 仓库。请配置 origin remote 或设置 GITHUB_REPOSITORY=owner/repo。')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'idlewise-release-publisher',
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  const text = await response.text()
  let data = text
  try {
    data = JSON.parse(text)
  } catch {
    /* keep text */
  }
  if (!response.ok) {
    const message = data?.message || text || response.statusText
    const error = new Error(`${response.status} ${message}`)
    error.status = response.status
    throw error
  }
  return data
}

async function main() {
  let release
  try {
    release = await api(`https://api.github.com/repos/${slug}/releases/tags/${tag}`)
    console.log(`release exists: #${release.id}`)
    release = await api(`https://api.github.com/repos/${slug}/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: `偷闲有道 ${tag}`, body: releaseBody(), draft: false, prerelease: false }),
    })
  } catch (error) {
    if (error.status !== 404) throw error
    release = await api(`https://api.github.com/repos/${slug}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: `偷闲有道 ${tag}`,
        body: releaseBody(),
        draft: false,
        prerelease: false,
      }),
    })
    console.log(`release created: #${release.id}`)
  }

  for (const file of files) {
    const name = path.basename(file)
    const existing = (release.assets || []).find((asset) => asset.name === name)
    if (existing) {
      await api(`https://api.github.com/repos/${slug}/releases/assets/${existing.id}`, { method: 'DELETE' })
      console.log(`replaced existing asset: ${name}`)
    }
    const uploadUrl = `https://uploads.github.com/repos/${slug}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`
    const data = fs.readFileSync(file)
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
      },
      body: data,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`upload ${name} failed: ${response.status} ${text}`)
    }
    console.log(`uploaded: ${name}`)
  }

  console.log(`\nRelease ready: https://github.com/${slug}/releases/tag/${tag}`)
}

main().catch((error) => {
  console.error(`\n发布失败：${error.message}`)
  process.exit(1)
})
