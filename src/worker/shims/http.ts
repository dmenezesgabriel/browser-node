import { EventEmitter } from './events'
import { Readable, Writable } from './stream'

// Registry of servers keyed by port, so the Worker can route SW requests
const servers = new Map<number, HttpServer>()

export function getServer(port: number): HttpServer | undefined {
  return servers.get(port)
}

export class IncomingMessage extends Readable {
  method: string
  url: string
  headers: Record<string, string | string[]>
  httpVersion = '1.1'
  socket = { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1', encrypted: false }
  complete = false
  aborted = false

  constructor(opts: { method: string; url: string; headers: Record<string, string>; body?: ArrayBuffer }) {
    super()
    this.method = opts.method.toUpperCase()
    this.url = opts.url
    this.headers = opts.headers
    if (opts.body) {
      queueMicrotask(() => {
        this.emit('data', new Uint8Array(opts.body!))
        this.readableEnded = true
        this.emit('end')
        this.complete = true
      })
    } else {
      queueMicrotask(() => { this.readableEnded = true; this.emit('end'); this.complete = true })
    }
  }
}

export class ServerResponse extends Writable {
  statusCode = 200
  statusMessage = 'OK'
  headers: Record<string, string | number | string[]> = {}
  headersSent = false
  writableEnded = false
  finished = false
  private _replyPort: MessagePort | null = null
  private _bodyChunks: (string | Uint8Array)[] = []
  req: IncomingMessage

  constructor(req: IncomingMessage, replyPort: MessagePort) {
    super()
    this.req = req
    this._replyPort = replyPort
  }

  setHeader(name: string, value: string | number | string[]): void {
    this.headers[name.toLowerCase()] = value
  }

  getHeader(name: string): string | number | string[] | undefined {
    return this.headers[name.toLowerCase()]
  }

  getHeaders(): Record<string, string | number | string[]> {
    return { ...this.headers }
  }

  hasHeader(name: string): boolean {
    return name.toLowerCase() in this.headers
  }

  removeHeader(name: string): void {
    delete this.headers[name.toLowerCase()]
  }

  writeHead(status: number, statusMsg?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>): this {
    this.statusCode = status
    if (typeof statusMsg === 'string') this.statusMessage = statusMsg
    else if (statusMsg && typeof statusMsg === 'object') headers = statusMsg as Record<string, string | string[]>
    if (headers) Object.entries(headers).forEach(([k, v]) => { this.headers[k.toLowerCase()] = v })
    this.headersSent = true
    return this
  }

  write(chunk: string | Uint8Array, _enc?: string, cb?: () => void): boolean {
    this.headersSent = true
    if (typeof chunk === 'string') {
      this._bodyChunks.push(chunk)
    } else {
      this._bodyChunks.push(chunk)
    }
    cb?.()
    return true
  }

  end(body?: string | Uint8Array | null, _enc?: string, cb?: () => void): this {
    if (this.writableEnded) return this
    console.log(`[http] res.end() called for status ${this.statusCode}`)
    this.writableEnded = true
    this.finished = true
    this.headersSent = true

    if (body != null) this._bodyChunks.push(body as string | Uint8Array)

    // Merge body chunks
    const parts = this._bodyChunks
    let bodyOut: string | Uint8Array
    if (parts.length === 0) {
      bodyOut = ''
    } else if (parts.every(p => typeof p === 'string')) {
      bodyOut = (parts as string[]).join('')
    } else {
      // Mixed or binary — convert to string if possible
      const strs = parts.map(p => typeof p === 'string' ? p : new TextDecoder().decode(p))
      bodyOut = strs.join('')
    }

    const hdrs: Record<string, string> = {}
    for (const [k, v] of Object.entries(this.headers)) {
      hdrs[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
    }
    if (!hdrs['content-type']) {
      console.log(`[http] Warning: no content-type for ${this.req.url}, defaulting to text/html`)
      hdrs['content-type'] = 'text/html; charset=utf-8'
    } else {
      console.log(`[http] Sending ${this.req.url} with type ${hdrs['content-type']}`)
    }

    this._replyPort?.postMessage({
      status: this.statusCode,
      headers: hdrs,
      body: bodyOut,
    })
    this._replyPort = null
    cb?.()
    this.emit('finish')
    return this
  }

  flushHeaders(): void { this.headersSent = true }
}

export class HttpServer extends EventEmitter {
  private _handler: ((req: IncomingMessage, res: ServerResponse, next?: () => void) => void) | null = null
  private _port = 0
  listening = false

  // Called by the SW-dispatch code in the worker (index.ts)
  handleRequest(msg: {
    method: string
    url: string
    headers: Record<string, string>
    body?: ArrayBuffer
    replyPort: MessagePort
  }) {
    console.log(`[http] Incoming request: ${msg.method} ${msg.url} (Accept: ${msg.headers['accept']})`)
    const req = new IncomingMessage(msg)
    const res = new ServerResponse(req, msg.replyPort)
    const onErr = (e: unknown) => {
      console.log(`[http] Handler error for ${msg.url}: ${(e as Error).message}`)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end(`Internal Error: ${(e as Error).stack}`)
      }
    }
    try {
      if (!this._handler) {
        console.log(`[http] No handler for ${msg.url}`)
        res.statusCode = 404
        res.end('Not Found')
        return
      }
      const result = this._handler(req, res, (err?: any) => {
        if (err) {
          console.log(`[http] next() called with err: ${err.message}`)
          return onErr(err)
        }
        if (!res.writableEnded) {
          console.log(`[http] next() called without err, ending response`)
          res.end()
        }
      })
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch((e: unknown) => {
          console.log(`[http] Async handler rejection: ${(e as Error).message}`)
          onErr(e)
        })
      }
    } catch (e) {
      onErr(e)
    }
  }

  listen(port: number | { port?: number; host?: string; backlog?: number }, hostOrCb?: string | number | (() => void), _backlogOrCb?: number | (() => void), cb?: () => void): this {
    console.log(`[http] listen called with arguments: port=${JSON.stringify(port)}, hostOrCb=${typeof hostOrCb}`)
    // Normalize arguments — same as Node.js net.Server.listen()
    let callback: (() => void) | undefined
    if (typeof port === 'object') {
      const opts = port as { port?: number; host?: string; backlog?: number }
      port = opts.port ?? 3000
      if (typeof hostOrCb === 'function') callback = hostOrCb as () => void
    } else {
      if (typeof hostOrCb === 'function') callback = hostOrCb as () => void
      else if (typeof _backlogOrCb === 'function') callback = _backlogOrCb as () => void
      else callback = cb
    }
    // In Node.js, the callback passed to listen() is a one-time listener for 'listening'
    if (callback) this.once('listening', callback)

    if (this.listening) return this  // already listening — Node.js silently ignores re-listen

    this._port = port as number
    this.listening = true  // set synchronously so re-entrant calls are rejected immediately
    servers.set(this._port, this)
    self.postMessage({ type: 'server-listen', port: this._port })
    // Use queueMicrotask to match Node.js async 'listening' emission
    queueMicrotask(() => { this.emit('listening') })
    return this
  }

  close(cb?: () => void): this {
    this.listening = false
    servers.delete(this._port)
    self.postMessage({ type: 'server-close', port: this._port })
    cb?.()
    this.emit('close')
    return this
  }

  address() { return { port: this._port, address: '127.0.0.1', family: 'IPv4' } }

  // Node.js http.Server methods that frameworks call
  setTimeout(_ms?: number, _cb?: () => void): this { return this }
  keepAliveTimeout = 5000
  maxHeadersCount = 2000
  requestTimeout = 0
  headersTimeout = 60000
  timeout = 0
  maxConnections = Infinity
  ref(): this { return this }
  unref(): this { return this }
}

export function createServer(
  optionsOrHandler?: Record<string, unknown> | ((req: IncomingMessage, res: ServerResponse) => void),
  maybeHandler?: (req: IncomingMessage, res: ServerResponse) => void
): HttpServer {
  const server = new HttpServer()
  // Node.js: createServer([options], [requestListener]) — handler may be 1st or 2nd arg
  const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler
  if (handler) {
    ;(server as unknown as { _handler: typeof handler })._handler = handler
  }
  return server
}

const STATUS_CODES: Record<number, string> = {
  100: 'Continue', 200: 'OK', 201: 'Created', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error',
  503: 'Service Unavailable',
}

export class Agent {
  maxSockets: number
  maxFreeSockets: number
  constructor(opts?: Record<string, unknown>) {
    this.maxSockets = (opts?.maxSockets as number | undefined) ?? Infinity
    this.maxFreeSockets = 256
  }
  destroy() {}
}

export const http = {
  createServer,
  Server: HttpServer,
  Agent,
  globalAgent: new Agent(),
  IncomingMessage,
  ServerResponse,
  HttpServer,
  STATUS_CODES,
  METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  get: (_url: string, _opts: unknown, _cb?: unknown) => {
    throw new Error('http.get not supported — use fetch()')
  },
  request: (_opts: unknown, _cb?: unknown) => {
    throw new Error('http.request not supported — use fetch()')
  },
}
export const https = {
  ...http,
  createServer: http.createServer,
}
