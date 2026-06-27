// sirv stub — static file serving from VFS
// Vite uses sirv for serving files from the public directory.
import { memfsInstance, existsInVfs, isFileInVfs } from '../vfs'
import { path } from './path'

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
  map: 'application/json; charset=utf-8',
}

function getMime(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

interface SirvOptions {
  etag?: boolean
  dotfiles?: boolean
  extensions?: string[]
  index?: string | boolean
}

export function sirv(
  dir: string,
  _opts: SirvOptions = {}
) {
  return function(req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) {
    const url = (req.url as string) || '/'
    const urlPath = url.split('?')[0]
    const fsPath = path.join(dir, urlPath)

    let resolved = fsPath
    console.log(`[SIRV] urlPath: ${urlPath}, dir: ${dir}, resolved: ${resolved}, exists: ${isFileInVfs(resolved)}`);
    if (!isFileInVfs(resolved)) {
      // Try index.html
      const idx = path.join(fsPath, 'index.html')
      if (isFileInVfs(idx)) {
        resolved = idx
      } else {
        next()
        return
      }
    }

    try {
      const content = memfsInstance.readFileSync(resolved) as Buffer
      ;(res as Record<string, (...a: unknown[]) => unknown>).writeHead?.(200, {
        'content-type': getMime(resolved),
        'content-length': String(content.length),
      })
      ;(res as Record<string, (...a: unknown[]) => unknown>).end?.(content)
    } catch {
      next()
    }
  }
}

export default sirv
