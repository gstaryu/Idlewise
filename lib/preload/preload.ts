import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke('idlewise:invoke', channel, payload),
  on: (channel: string, callback: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
}

contextBridge.exposeInMainWorld('idlewise', api)
