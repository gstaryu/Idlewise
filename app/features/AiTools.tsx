import doubaoLogo from '@/app/assets/ai/doubao.png'
import deepseekLogo from '@/app/assets/ai/deepseek.png'
import kimiLogo from '@/app/assets/ai/kimi.png'
import yuanbaoLogo from '@/app/assets/ai/yuanbao.png'
import zhipuLogo from '@/app/assets/ai/zhipu.png'
import chatgptLogo from '@/app/assets/ai/chatgpt.png'
import { useAppStore, useBrowserStore } from '@/app/store'

const AI_SITES = [
  { name: '豆包', url: 'https://www.doubao.com', host: 'doubao.com', logo: doubaoLogo },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', host: 'deepseek.com', logo: deepseekLogo },
  { name: 'Kimi', url: 'https://www.kimi.com', host: 'kimi.com', logo: kimiLogo },
  { name: '元宝', url: 'https://yuanbao.tencent.com', host: 'yuanbao.tencent.com', logo: yuanbaoLogo },
  { name: '智谱', url: 'https://chat.z.ai', host: 'chat.z.ai', logo: zhipuLogo },
  { name: 'ChatGPT', url: 'https://chatgpt.com', host: 'chatgpt.com', logo: chatgptLogo },
]

export default function AiTools() {
  const setView = useAppStore((s) => s.setView)
  const open = (url: string, newTab = false) => {
    setView('browser')
    if (newTab) void useBrowserStore.getState().newTab(url)
    else void useBrowserStore.getState().navigate(url)
  }
  return (
    <div className="ai-page">
      <div className="ai-head">
        <h1>AI 工具</h1>
        <p>点击任意工具，会在浏览视图的当前标签打开官网；登录状态由浏览器分区保存。</p>
      </div>
      <div className="ai-grid">
        {AI_SITES.map((site) => (
          <button
            key={site.url}
            type="button"
            className="ai-card"
            onClick={() => open(site.url)}
            onAuxClick={(event) => {
              if (event.button !== 1) return
              event.preventDefault()
              open(site.url, true)
            }}
            title={site.url}
          >
            <img className="ai-logo" src={site.logo} alt={`${site.name} logo`} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{site.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{site.host}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="ai-note">各工具名称与图标归其各自所有者所有，本应用仅提供官方站点入口。</p>
    </div>
  )
}
