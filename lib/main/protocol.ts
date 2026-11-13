import { app, protocol, net } from 'electron'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { ASSET_SCHEME } from '../shared/branding'
import { assetsDir } from './store'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ])
}

export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const base = assetsDir()
      const target = normalize(join(base, rel))
      if (!target.startsWith(base + sep) && target !== base) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

export function assetUrl(relativePath: string): string {
  return `${ASSET_SCHEME}://local/${relativePath.split(sep).join('/')}`
}

export function absoluteAsset(relativePath: string): string {
  return join(assetsDir(), relativePath)
}

export function appIconPath(): string {
  return join(app.getAppPath(), 'resources', 'build', 'icon.png')
}
