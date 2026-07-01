import { Buffer } from 'buffer'
import { EventEmitter } from './events'
import { Readable, Writable } from './stream'

// Registry of servers keyed by port, so the Worker can route SW requests
const servers = new Map<number, HttpServer>()

export function getServer(port: number): HttpServer | undefined {
  return servers.get(port)
}

export class IncomingMessage extends Readable {
  method?: string
  url?: string
  statusCode?: number
  statusMessage?: string
  headers: Record<string, string | string[]>
  httpVersion = '1.1'
  socket = { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1', encrypted: false }
  complete = false
  aborted = false

  constructor(opts: {
    method?: string
    url?: string
    statusCode?: number
    statusMessage?: string
    headers: Record<string, string | string[]>
    body?: ArrayBuffer | string | Uint8Array
  }) {
    super()
    this.method = opts.method?.toUpperCase()
    this.url = opts.url
    this.statusCode = opts.statusCode
    this.statusMessage = opts.statusMessage ?? 'OK'
    this.headers = opts.headers
    
    if (opts.body) {
      const buffer = typeof opts.body === 'string'
        ? Buffer.from(opts.body)
        : Buffer.from(opts.body)
      queueMicrotask(() => {
        this.emit('data', buffer)
        this.readableEnded = true
        this.emit('end')
        this.complete = true
      })
    } else {
      queueMicrotask(() => { this.readableEnded = true; this.emit('end'); this.complete = true })
    }
  }
}

export class ClientRequest extends Writable {
  method: string
  path: string
  host: string
  port: number
  headers: Record<string, string>
  private _bodyChunks: (string | Uint8Array)[] = []
  private _url: string

  constructor(
    options: any,
    callback?: (res: IncomingMessage) => void
  ) {
    super()
    
    let parsedUrl: URL | null = null
    let method = 'GET'
    let headers: Record<string, string> = {}
    let path = '/'
    let host = 'localhost'
    let port = 80

    if (typeof options === 'string') {
      parsedUrl = new URL(options)
    } else if (options instanceof URL) {
      parsedUrl = options
    } else if (options && typeof options === 'object') {
      method = (options.method as string | undefined)?.toUpperCase() ?? 'GET'
      headers = (options.headers as Record<string, string> | undefined) ?? {}
      path = (options.path as string | undefined) ?? '/'
      host = (options.hostname as string | undefined) ?? (options.host as string | undefined) ?? 'localhost'
      port = (options.port as number | string | undefined) ? Number(options.port) : 80
      
      if (options.href) {
        parsedUrl = new URL(options.href as string)
      } else if (options.protocol) {
        parsedUrl = new URL(`${options.protocol}//${host}:${port}${path}`)
      }
    }

    if (parsedUrl) {
      method = method || 'GET'
      host = parsedUrl.hostname
      port = parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80)
      path = parsedUrl.pathname + parsedUrl.search
    }

    this.method = method
    this.path = path
    this.host = host
    this.port = port
    this.headers = headers
    this._url = parsedUrl ? parsedUrl.href : `http://${host}:${port}${path}`

    if (callback) {
      this.once('response', callback)
    }
  }

  write(chunk: string | Uint8Array, _enc?: string, cb?: () => void): boolean {
    if (chunk != null) {
      this._bodyChunks.push(chunk)
    }
    cb?.()
    return true
  }

  end(body?: string | Uint8Array | null, _enc?: string, cb?: () => void): this {
    if (body != null) {
      this._bodyChunks.push(body)
    }
    cb?.()

    let requestBody: Uint8Array | undefined
    if (this._bodyChunks.length > 0) {
      if (this._bodyChunks.every(c => typeof c === 'string')) {
        requestBody = new TextEncoder().encode(this._bodyChunks.join(''))
      } else {
        const parts = this._bodyChunks.map(c => typeof c === 'string' ? new TextEncoder().encode(c) : c)
        const totalLen = parts.reduce((acc, p) => acc + p.length, 0)
        const merged = new Uint8Array(totalLen)
        let offset = 0
        for (const p of parts) {
          merged.set(p, offset)
          offset += p.length
        }
        requestBody = merged
      }
    }

    this._dispatch(requestBody)
    return this
  }

  private async _dispatch(body?: Uint8Array) {
    const isLocal = this.host === 'localhost' || this.host === '127.0.0.1'
    const server = isLocal ? getServer(this.port) : undefined

    if (server) {
      const channel = new MessageChannel()
      const clientPort = channel.port1
      const serverPort = channel.port2

      clientPort.onmessage = (e) => {
        const resMsg = e.data
        const responseHeaders: Record<string, string> = {}
        if (resMsg.headers) {
          for (const [k, v] of Object.entries(resMsg.headers)) {
            responseHeaders[k.toLowerCase()] = String(v)
          }
        }
        const res = new IncomingMessage({
          statusCode: resMsg.status ?? 200,
          headers: responseHeaders,
          body: typeof resMsg.body === 'string' ? new TextEncoder().encode(resMsg.body) : resMsg.body,
        })
        this.emit('response', res)
        clientPort.close()
      }

      const bodyBuffer = body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : undefined

      server.handleRequest({
        method: this.method,
        url: this.path,
        headers: this.headers,
        body: bodyBuffer,
        replyPort: serverPort,
      })
    } else {
      try {
        const fetchHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(this.headers)) {
          fetchHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v)
        }

        const response = await fetch(this._url, {
          method: this.method,
          headers: fetchHeaders,
          body: this.method !== 'GET' && this.method !== 'HEAD' ? body : undefined,
        })

        const resBody = await response.arrayBuffer()
        
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((v, k) => {
          responseHeaders[k.toLowerCase()] = v
        })

        const res = new IncomingMessage({
          statusCode: response.status,
          statusMessage: response.statusText,
          headers: responseHeaders,
          body: resBody,
        })
        this.emit('response', res)
      } catch (err: any) {
        this.emit('error', err)
      }
    }
  }
}

export function request(
  optionsOrUrl: string | Record<string, any> | URL,
  optionsOrCallback?: Record<string, any> | ((res: IncomingMessage) => void),
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  let opts = optionsOrUrl
  let cb = callback

  if (typeof optionsOrCallback === 'function') {
    cb = optionsOrCallback as (res: IncomingMessage) => void
  } else if (optionsOrCallback && typeof optionsOrCallback === 'object') {
    if (typeof optionsOrUrl === 'string' || optionsOrUrl instanceof URL) {
      const parsed = typeof optionsOrUrl === 'string' ? new URL(optionsOrUrl) : optionsOrUrl
      opts = {
        method: 'GET',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        ...optionsOrCallback
      }
    } else {
      opts = { ...optionsOrUrl as any, ...optionsOrCallback }
    }
  }

  return new ClientRequest(opts, cb)
}

export function get(
  optionsOrUrl: string | Record<string, any> | URL,
  optionsOrCallback?: Record<string, any> | ((res: IncomingMessage) => void),
  callback?: (res: IncomingMessage) => void
): ClientRequest {
  const req = request(optionsOrUrl, optionsOrCallback, callback)
  req.end()
  return req
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
  ClientRequest,
  STATUS_CODES,
  METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  request,
  get,
}
export const https = {
  ...http,
  createServer: http.createServer,
}
