// Minimal connect-compatible middleware stack
// Vite uses connect for its internal middleware pipeline.

type Req = Record<string, unknown>
type Res = Record<string, unknown>
type NextFn = (err?: unknown) => void
type Middleware = ((req: Req, res: Res, next: NextFn) => void)
  | ((err: unknown, req: Req, res: Res, next: NextFn) => void)

interface Layer { route: string; handle: Middleware }

interface ConnectApp {
  (req: Req, res: Res, next?: NextFn): void
  use(route: string | Middleware, handle?: Middleware): ConnectApp
  handle(req: Req, res: Res, out?: NextFn): void
  stack: Layer[]
}

function createApp(): ConnectApp {
  const stack: Layer[] = []

  function app(req: Req, res: Res, next?: NextFn) {
    app.handle(req, res, next)
  }

  app.stack = stack

  app.use = function(route: string | Middleware, handle?: Middleware): ConnectApp {
    if (typeof route === 'function') {
      handle = route as Middleware
      route = '/'
    }
    stack.push({ route: route as string, handle: handle! })
    return app
  }

  app.handle = function(req: Req, res: Res, out?: NextFn) {
    let idx = 0
    const url = (req.url as string) || '/'

    function next(err?: unknown): void {
      const layer = stack[idx++]
      if (!layer) {
        if (out) { out(err); return }
        // No more middleware — send 404
        if (!(res as Record<string, unknown>).writableEnded) {
          (res as Record<string, (...a: unknown[]) => unknown>).writeHead?.(404, { 'content-type': 'text/plain' })
          ;(res as Record<string, (...a: unknown[]) => unknown>).end?.('Not Found')
        }
        return
      }

      const { route, handle } = layer
      // Route matching: '/' matches everything; otherwise must be a prefix
      if (route !== '/' && !url.startsWith(route)) { next(err); return }

      try {
        if (err) {
          if (handle.length >= 4) {
            ;(handle as (e: unknown, q: Req, r: Res, n: NextFn) => void)(err, req, res, next)
          } else {
            next(err)
          }
        } else {
          ;(handle as (q: Req, r: Res, n: NextFn) => void)(req, res, next)
        }
      } catch (e) {
        next(e)
      }
    }

    next()
  }

  return app as unknown as ConnectApp
}

export default createApp
export { createApp as createServer }
