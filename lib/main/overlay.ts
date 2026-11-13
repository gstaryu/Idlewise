import { BrowserWindow } from 'electron'
import { join } from 'path'
import { runtime } from './state'

type OverlayKind = 'opacity' | 'browser' | 'stealth' | 'fontcolor'
type Anchor = { x: number; y: number; width: number; height: number } | undefined
export interface OverlayContext {
  readerFormat?: string | null
}

const PAD = 8

let overlay: BrowserWindow | null = null
let overlayContentsId: number | null = null
let overlayAnchor: Anchor
let overlayContext: OverlayContext = {}
let removeParentListeners: (() => void) | null = null
let showFallback: NodeJS.Timeout | null = null

export function isOverlayContents(id: number): boolean {
  return overlayContentsId === id
}

function overlayHtml(kind: OverlayKind, context: OverlayContext): string {
  const kindJson = JSON.stringify(kind)
  const contextJson = JSON.stringify(context ?? {})
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;color:#2b2b2b}
  .panel{width:100%;max-height:100vh;overflow:auto;padding:14px;border:1px solid #e4ded2;border-radius:14px;background:#fffdf8;box-shadow:0 16px 40px rgba(35,30,24,.18);font-size:12px}
  .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-weight:700;font-size:13px}
  .close{border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#857d70}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:9px 0}
  .muted{color:#857d70;font-size:11px;line-height:1.55;margin:2px 0 10px}
  .presets{display:flex;gap:4px}
  .presets button{border:1px solid #ddd5c8;background:#fffdf8;border-radius:5px;padding:2px 6px;font-size:10px;cursor:pointer}
  input[type=range]{width:100%;accent-color:#397f74;margin:4px 0}
  label.sw{display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer}
  input[type=checkbox]{accent-color:#397f74;width:15px;height:15px}
  .divider{height:1px;background:#ece5d8;margin:12px 0}
  .foot{display:flex;justify-content:flex-end;margin-top:10px}
  .primary{border:0;border-radius:7px;background:#397f74;color:#fff;padding:6px 12px;cursor:pointer}
  .sect{margin:14px 0 6px;font-weight:700;font-size:12px;color:#4a443b}
  .swatches{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
  .swatch{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.16)}
  .swatch.active{border-color:#397f74}
  .colorline{display:flex;align-items:center;gap:8px;margin:8px 0}
  .colorline input[type=color]{width:34px;height:28px;border:1px solid #ddd5c8;border-radius:6px;background:none;padding:1px;cursor:pointer}
  .colorline input[type=text]{flex:1;height:28px;border:1px solid #ddd5c8;border-radius:6px;padding:0 8px;font:inherit;text-transform:uppercase;background:#fffdf8}
  .linkbtn{border:0;background:transparent;color:#397f74;cursor:pointer;padding:6px 0;font-size:12px;text-align:left}
  .rowcol{display:flex;flex-direction:column;gap:4px;margin:8px 0}
  .rowcol>span{font-size:12px;color:#5a544a}
  select.sel{height:28px;border:1px solid #ddd5c8;border-radius:6px;background:#fffdf8;font:inherit;padding:0 6px;width:100%}
  </style></head><body><div class="panel" id="panel">
  <div class="head"><span id="title"></span><button class="close" id="close" aria-label="关闭">×</button></div>
  <div id="body"></div>
  </div><script>
  const api=window.idlewise,kind=${kindJson},context=${contextJson};
  const $=(id)=>document.getElementById(id);
  function measure(){const p=$('panel');const w=Math.ceil(p.scrollWidth||p.offsetWidth||304);const h=Math.ceil(p.scrollHeight||p.offsetHeight||200);void api.invoke('overlay:measure',{width:w,height:h})}
  function preview(channel,value){void api.invoke('window:preview-opacity',{[channel]:Number(value)})}
  async function settings(){return api.invoke('settings:get')}
  async function apply(patch){await api.invoke('settings:update',patch)}
  async function save(patch){await apply(patch);await render()}
  function input(label,value,min,max,oninput,onchange,suffix,step){const unit=suffix===undefined?'%':suffix;const wrap=document.createElement('div');wrap.innerHTML='<div class="row"><span>'+label+'</span><span class="val"></span></div><input type="range" min="'+min+'" max="'+max+'" step="'+(step||1)+'" value="'+value+'">';const range=wrap.querySelector('input'),val=wrap.querySelector('.val');val.textContent=value+unit;range.oninput=()=>{val.textContent=range.value+unit;oninput?.(range.value)};range.onchange=()=>onchange?.(range.value);return wrap}
  function presetRow(label,values,onPick){const row=document.createElement('div');row.className='row';row.innerHTML='<span>'+label+'</span><span class="presets"></span>';const box=row.querySelector('.presets');values.forEach(v=>{const b=document.createElement('button');b.textContent=v+'%';b.onclick=()=>onPick(v);box.appendChild(b)});return row}
  function check(label,checked,onChange){const l=document.createElement('label');l.className='sw';l.innerHTML='<input type="checkbox" '+(checked?'checked':'')+'><span>'+label+'</span>';const cb=l.querySelector('input');cb.onchange=()=>onChange(cb.checked);return l}
  function note(text){const p=document.createElement('p');p.className='muted';p.textContent=text;return p}
  function heading(text){const h=document.createElement('div');h.className='sect';h.textContent=text;return h}
  function swatchRow(value,onPick){const row=document.createElement('div');row.className='swatches';['#2b2b2b','#000000','#ffffff','#2f6f5e','#6b4f2a','#7a2f2f'].forEach(c=>{const b=document.createElement('button');b.className='swatch'+(String(value).toLowerCase()===c?' active':'');b.style.background=c;b.title=c;b.onclick=()=>onPick(c);row.appendChild(b)});return row}
  function colorRow(label,value,onCommit,onPreview){const row=document.createElement('div');row.className='colorline';row.innerHTML='<span>'+label+'</span><input type="color" value="'+value+'"><input type="text" value="'+value+'" maxlength="7">';const pick=row.querySelector('input[type=color]'),text=row.querySelector('input[type=text]');pick.oninput=()=>{text.value=pick.value;onPreview?.(pick.value)};pick.onchange=()=>{text.value=pick.value;onCommit(pick.value)};text.onchange=()=>{const v=text.value.trim();if(/^#[0-9a-f]{6}$/i.test(v)){pick.value=v;onCommit(v)}else{text.value=value}};return row}
  function selectRow(label,value,options,onChange){const wrap=document.createElement('label');wrap.className='rowcol';wrap.innerHTML='<span>'+label+'</span><select class="sel"></select>';const sel=wrap.querySelector('select');options.forEach(o=>{const op=document.createElement('option');op.value=o[0];op.textContent=o[1];if(o[0]===value)op.selected=true;sel.appendChild(op)});sel.onchange=()=>onChange(sel.value);return wrap}
  async function render(){const s=await settings(),body=$('body'),title=$('title');$('panel').style.width=kind==='fontcolor'?'328px':'304px';body.textContent='';
    if(kind==='opacity'){title.textContent='透明度';body.appendChild(presetRow('整体不透明度',[0,50,100],async v=>{await apply({window:{opacity:Number(v)}});render()}));body.appendChild(input('整体不透明度（含文字）',Math.round(s.window.opacity),0,100,v=>preview('opacity',v),v=>apply({window:{opacity:Number(v)}})));body.appendChild(note('100% = 完全可见；0% 保留极低可见度，确保仍可从托盘/老板键恢复。'));
      const d=document.createElement('div');d.className='divider';body.appendChild(d);
      body.appendChild(presetRow('背景透明度（文字不变）',[0,50,100],async v=>{await apply({window:{backgroundTransparency:Number(v)}});render()}));body.appendChild(input('背景透明度（文字不变）',Math.round(s.window.backgroundTransparency),0,100,v=>preview('backgroundTransparency',v),v=>apply({window:{backgroundTransparency:Number(v)}})));body.appendChild(note('100% = 背景透明，文字保持；0% = 背景不透明。'));
    }else if(kind==='stealth'){title.textContent='自动隐藏';
      body.appendChild(check('鼠标移出时隐藏菜单栏',s.stealth.headerAutoHide,v=>apply({stealth:{headerAutoHide:v}})));
      body.appendChild(check('鼠标移出时隐藏主体',s.stealth.bodyAutoHide,v=>apply({stealth:{bodyAutoHide:v}})));
      body.appendChild(note('菜单栏和主体可独立隐藏；移回窗口或顶部热区即恢复。截屏保护在顶部盾牌按钮单独设置。'));
    }else if(kind==='browser'){title.textContent='网页设置';
      body.appendChild(input('网页缩放',Math.round(s.browser.zoom),50,200,undefined,v=>api.invoke('browser:set-zoom',{zoom:Number(v)})));
      const active=await api.invoke('browser:active')||{};const compat=Boolean(active.compat);
      body.appendChild(check('当前站点兼容模式',compat,async v=>{await api.invoke('browser:toggle-compat',{});render()}));
      body.appendChild(check('手机模式访问',s.browser.mobileMode,v=>api.invoke('browser:set-mobile',{enabled:v})));
      const speedRow=document.createElement('div');speedRow.className='row';speedRow.innerHTML='<span>视频速度</span><span class="presets"></span>';const box=speedRow.querySelector('.presets');[0.75,1,1.5,2].forEach(v=>{const b=document.createElement('button');b.textContent=v+'×';b.onclick=()=>{void api.invoke('browser:set-video-speed',{speed:v});render()};box.appendChild(b)});body.appendChild(speedRow);
    }else if(kind==='fontcolor'){title.textContent='字体颜色';
      body.appendChild(heading('网页文字'));
      body.appendChild(check('启用网页文字颜色',s.browser.webTextColorEnabled,v=>save({browser:{webTextColorEnabled:v}})));
      body.appendChild(swatchRow(s.browser.webTextColor,c=>save({browser:{webTextColorEnabled:true,webTextColor:c}})));
      body.appendChild(colorRow('自定义',s.browser.webTextColor,c=>save({browser:{webTextColorEnabled:true,webTextColor:c}}),c=>apply({browser:{webTextColorEnabled:true,webTextColor:c}})));
      body.appendChild(note('只改网页文字颜色；背景、图片、滚动条不受影响。兼容模式站点不生效。'));
      const d=document.createElement('div');d.className='divider';body.appendChild(d);
      body.appendChild(heading('阅读文字'));
      if(context&&context.readerFormat==='pdf'){
        body.appendChild(note('PDF 为固定版式：字体、字号、行距、文字颜色不可用；请使用阅读页顶部的缩放按钮。'));
      }else{
        body.appendChild(swatchRow(s.reader.textColor,c=>save({reader:{textColor:c}})));
        body.appendChild(colorRow('自定义',s.reader.textColor,c=>save({reader:{textColor:c}}),c=>apply({reader:{textColor:c}})));
        body.appendChild(input('字号',Math.round(s.reader.fontSize),12,40,v=>apply({reader:{fontSize:Number(v)}}),v=>save({reader:{fontSize:Number(v)}}),'px'));
        body.appendChild(input('行距',Number(s.reader.lineHeight).toFixed(1),1.2,2.6,v=>apply({reader:{lineHeight:Number(v)}}),v=>save({reader:{lineHeight:Number(v)}}),'',0.1));
        body.appendChild(selectRow('字体',s.reader.fontFamily,[['','系统字体'],['SimSun','宋体'],['SimHei','黑体'],['KaiTi','楷体'],['Microsoft YaHei','微软雅黑'],['monospace','等宽']],v=>save({reader:{fontFamily:v}})));
      }
    }
    requestAnimationFrame(measure)}
  $('close').onclick=()=>api.invoke('overlay:close');
  document.addEventListener('keydown',e=>{if(e.key==='Escape')api.invoke('overlay:close')});
  window.addEventListener('resize',measure);
  render().then(()=>{measure();setTimeout(measure,80)}).catch(e=>{$('body').textContent='面板加载失败：'+e.message;measure()});
  </script></body></html>`
}

function placeOverlay(width: number, height: number): void {
  const parent = runtime.win
  const win = overlay
  if (!parent || parent.isDestroyed() || !win || win.isDestroyed()) return
  const pb = parent.getContentBounds()
  const w = Math.min(Math.max(width, 220), Math.max(220, pb.width - PAD * 2))
  const h = Math.min(Math.max(height, 120), Math.max(120, pb.height - PAD * 2))
  const anchor = overlayAnchor
  const anchorX = anchor ? anchor.x : pb.width - 40
  const anchorY = anchor ? anchor.y : 0
  const anchorW = anchor ? anchor.width : 0
  const anchorH = anchor ? anchor.height : 0
  let x = anchorX + anchorW - w
  let y = anchorY + anchorH + 8
  if (y + h > pb.height - PAD) y = anchorY - h - 8
  x = Math.min(Math.max(x, PAD), Math.max(PAD, pb.width - w - PAD))
  y = Math.min(Math.max(y, PAD), Math.max(PAD, pb.height - h - PAD))
  win.setBounds({ x: Math.round(pb.x + x), y: Math.round(pb.y + y), width: Math.round(w), height: Math.round(h) })
  if (!win.isVisible()) {
    win.show()
    win.focus()
  }
}

export function resizeOverlay(width: number, height: number): boolean {
  if (!overlay) return false
  placeOverlay(width, height)
  return true
}

export function openOverlay(kind: OverlayKind, anchor?: Anchor, context: OverlayContext = {}): boolean {
  closeOverlay()
  const parent = runtime.win
  if (!parent || parent.isDestroyed()) return false
  const pb = parent.getContentBounds()
  overlayAnchor = anchor
  overlayContext = context
  const win = new BrowserWindow({
    x: pb.x + PAD,
    y: pb.y + PAD,
    width: kind === 'fontcolor' ? 328 : 304,
    height: 200,
    parent,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  overlay = win
  overlayContentsId = win.webContents.id
  win.setMenuBarVisibility(false)
  win.setSkipTaskbar(true)
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml(kind, overlayContext))}`)
  const openedAt = Date.now()
  showFallback = setTimeout(() => {
    if (overlay === win && !win.isVisible()) placeOverlay(kind === 'fontcolor' ? 328 : 304, 360)
  }, 500)
  win.on('closed', () => {
    if (overlay === win) overlay = null
    overlayContentsId = null
    runtime.popoverOpen = false
    if (!parent.isDestroyed()) parent.webContents.send('overlay:closed')
    removeParentListeners?.()
    removeParentListeners = null
    if (showFallback) {
      clearTimeout(showFallback)
      showFallback = null
    }
  })
  const close = () => closeOverlay()
  const onParentFocus = () => {
    if (Date.now() - openedAt > 150) closeOverlay()
  }
  parent.on('move', close)
  parent.on('resize', close)
  parent.on('focus', onParentFocus)
  removeParentListeners = () => {
    parent.removeListener('move', close)
    parent.removeListener('resize', close)
    parent.removeListener('focus', onParentFocus)
  }
  runtime.popoverOpen = true
  return true
}

export function closeOverlay(): boolean {
  const win = overlay
  if (!win) return false
  overlay = null
  try {
    if (!win.isDestroyed()) win.destroy()
  } catch {
    /* ignore */
  }
  removeParentListeners?.()
  removeParentListeners = null
  if (showFallback) {
    clearTimeout(showFallback)
    showFallback = null
  }
  runtime.popoverOpen = false
  return true
}
