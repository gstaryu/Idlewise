import { app } from 'electron'
import { dirname, join } from 'path'
import fse from 'fs-extra'

export function userDataDir(): string {
  const dir = app.getPath('userData')
  fse.ensureDirSync(dir)
  return dir
}

export function dataFile(name: string): string {
  return join(userDataDir(), name)
}

export function assetsDir(): string {
  const dir = join(userDataDir(), 'assets')
  fse.ensureDirSync(dir)
  return dir
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const value = fse.readJSONSync(file)
    return value ?? fallback
  } catch {
    return fallback
  }
}

/** 原子写：先写临时文件再替换，避免半截 JSON。 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  try {
    await fse.ensureDir(dirname(file))
    const tmp = `${file}.${process.pid}.tmp`
    await fse.writeJSON(tmp, data, { spaces: 2 })
    await fse.move(tmp, file, { overwrite: true })
  } catch (err) {
    console.error('[store] write failed', file, err)
  }
}

export function writeJsonSyncAtomic(file: string, data: unknown): void {
  try {
    fse.ensureDirSync(dirname(file))
    const tmp = `${file}.${process.pid}.tmp`
    fse.writeJSONSync(tmp, data, { spaces: 2 })
    fse.moveSync(tmp, file, { overwrite: true })
  } catch (err) {
    console.error('[store] write failed', file, err)
  }
}
