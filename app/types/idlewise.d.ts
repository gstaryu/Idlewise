import type { AppSettings } from '../../lib/shared/types'

export interface IdlewiseBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  on(channel: string, callback: (payload: any) => void): () => void
  platform: string
  versions: { chrome: string; electron: string; node: string }
}

declare global {
  interface Window {
    idlewise: IdlewiseBridge
    __idlewiseSettings?: AppSettings
  }
}

export {}
