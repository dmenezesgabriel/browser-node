import { describe, it, expect, beforeEach } from 'vitest'
import { createServer, IncomingMessage, ServerResponse, Agent, http } from '../src/worker/shims/http'
const STATUS_CODES = http.STATUS_CODES

// Build a minimal fake MessagePort for ServerResponse
function fakePort() {
  const received: unknown[] = []
  return {
    postMessage(data: unknown) { received.push(data) },
    received,
  }
}

describe('http shim', () => {
  describe('createServer', () => {
    it('returns an HttpServer instance', () => {
      const s = createServer()
      expect(s).toBeDefined()
      expect(typeof s.listen).toBe('function')
      expect(typeof s.close).toBe('function')
    })

    it('accepts a request listener as first argument', () => {
      const handler = () => {}
      const s = createServer(handler)
      expect(s).toBeDefined()
    })

    it('accepts options object + handler as second argument', () => {
      const handler = () => {}
      const s = createServer({}, handler)
      expect(s).toBeDefined()
    })
  })

  describe('HttpServer.listen', () => {
    it('sets listening to true', async () => {
      const s = createServer()
      s.listen(3100)
      expect(s.listening).toBe(true)
      s.close()
    })

    it('fires the listening callback asynchronously', async () => {
      const s = createServer()
      let fired = false
      s.listen(3101, () => { fired = true })
      expect(fired).toBe(false)
      await new Promise(r => queueMicrotask(r))
      expect(fired).toBe(true)
      s.close()
    })

    it('address() returns port and host after listen', async () => {
      const s = createServer()
      s.listen(3102)
      const addr = s.address() as { port: number; address: string }
      expect(addr.port).toBe(3102)
      expect(addr.address).toBe('127.0.0.1')
      s.close()
    })

    it('close() sets listening to false', () => {
      const s = createServer()
      s.listen(3103)
      s.close()
      expect(s.listening).toBe(false)
    })
  })

  describe('IncomingMessage', () => {
    it('has correct method and url', async () => {
      const req = new IncomingMessage({ method: 'GET', url: '/test', headers: {} })
      expect(req.method).toBe('GET')
      expect(req.url).toBe('/test')
      await new Promise(r => queueMicrotask(r))
    })

    it('normalises method to uppercase', async () => {
      const req = new IncomingMessage({ method: 'post', url: '/', headers: {} })
      expect(req.method).toBe('POST')
      await new Promise(r => queueMicrotask(r))
    })

    it('emits end event when no body', async () => {
      const req = new IncomingMessage({ method: 'GET', url: '/', headers: {} })
      let ended = false
      req.on('end', () => { ended = true })
      await new Promise(r => setTimeout(r, 10))
      expect(ended).toBe(true)
      expect(req.complete).toBe(true)
    })

    it('emits data + end when body provided', async () => {
      const body = new TextEncoder().encode('hello').buffer
      const req = new IncomingMessage({ method: 'POST', url: '/', headers: {}, body })
      const chunks: Uint8Array[] = []
      req.on('data', (c) => chunks.push(c as Uint8Array))
      let ended = false
      req.on('end', () => { ended = true })
      await new Promise(r => setTimeout(r, 10))
      expect(ended).toBe(true)
      expect(new TextDecoder().decode(chunks[0])).toBe('hello')
    })

    it('exposes headers', () => {
      const req = new IncomingMessage({ method: 'GET', url: '/', headers: { 'content-type': 'application/json' } })
      expect(req.headers['content-type']).toBe('application/json')
    })
  })

  describe('ServerResponse', () => {
    it('writeHead sets status code', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.writeHead(404)
      expect(res.statusCode).toBe(404)
    })

    it('setHeader and getHeader work', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.setHeader('Content-Type', 'text/plain')
      expect(res.getHeader('content-type')).toBe('text/plain')
    })

    it('hasHeader returns true for set header', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.setHeader('X-Custom', '1')
      expect(res.hasHeader('x-custom')).toBe(true)
      expect(res.hasHeader('x-missing')).toBe(false)
    })

    it('removeHeader deletes the header', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.setHeader('X-Remove', '1')
      res.removeHeader('x-remove')
      expect(res.hasHeader('x-remove')).toBe(false)
    })

    it('end sends response via the reply port', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<h1>hi</h1>')
      expect(port.received).toHaveLength(1)
      const msg = port.received[0] as { status: number; body: string; headers: Record<string, string> }
      expect(msg.status).toBe(200)
      expect(msg.body).toBe('<h1>hi</h1>')
      expect(msg.headers['content-type']).toBe('text/html')
    })

    it('end is idempotent — second call is a no-op', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.end('first')
      res.end('second')
      expect(port.received).toHaveLength(1)
    })

    it('write + end concatenates chunks', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.write('hello ')
      res.write('world')
      res.end()
      const msg = port.received[0] as { body: string }
      expect(msg.body).toBe('hello world')
    })

    it('getHeaders returns all headers', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      res.setHeader('A', '1')
      res.setHeader('B', '2')
      const hdrs = res.getHeaders()
      expect(hdrs.a).toBe('1')
      expect(hdrs.b).toBe('2')
    })

    it('emits finish event after end', () => {
      const port = fakePort()
      const res = new ServerResponse({ url: "/" } as any, port as unknown as MessagePort)
      let finished = false
      res.on('finish', () => { finished = true })
      res.end('done')
      expect(finished).toBe(true)
    })
  })

  describe('Agent', () => {
    it('creates an agent with default maxSockets', () => {
      const a = new Agent()
      expect(a.maxSockets).toBe(Infinity)
    })

    it('accepts custom maxSockets', () => {
      const a = new Agent({ maxSockets: 5 })
      expect(a.maxSockets).toBe(5)
    })

    it('destroy() does not throw', () => {
      const a = new Agent()
      expect(() => a.destroy()).not.toThrow()
    })
  })

  describe('http object exports', () => {
    it('exposes createServer', () => {
      expect(typeof http.createServer).toBe('function')
    })

    it('exposes STATUS_CODES with 200 OK', () => {
      expect(STATUS_CODES[200]).toBe('OK')
      expect(STATUS_CODES[404]).toBe('Not Found')
      expect(STATUS_CODES[500]).toBe('Internal Server Error')
    })

    it('exposes METHODS array', () => {
      expect(http.METHODS).toContain('GET')
      expect(http.METHODS).toContain('POST')
    })

    it('http.get throws with guidance', () => {
      expect(() => (http as unknown as { get: () => void }).get()).toThrow('use fetch()')
    })

    it('http.request throws with guidance', () => {
      expect(() => (http as unknown as { request: () => void }).request()).toThrow('use fetch()')
    })
  })

  describe('handleRequest', () => {
    it('calls the request handler and gets a response', async () => {
      const port = fakePort()
      const s = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(`Hello ${req.method} ${req.url}`)
      })
      s.listen(3120)

      await new Promise<void>((resolve) => {
        s.once('listening', resolve)
        queueMicrotask(() => {})
      })

      s.handleRequest({
        method: 'GET',
        url: '/path',
        headers: {},
        replyPort: port as unknown as MessagePort,
      })

      await new Promise(r => setTimeout(r, 10))

      expect(port.received).toHaveLength(1)
      const msg = port.received[0] as { status: number; body: string }
      expect(msg.status).toBe(200)
      expect(msg.body).toBe('Hello GET /path')
      s.close()
    })

    it('returns 500 when handler throws', async () => {
      const port = fakePort()
      const s = createServer(() => {
        throw new Error('handler error')
      })
      s.listen(3121)
      s.handleRequest({
        method: 'GET',
        url: '/',
        headers: {},
        replyPort: port as unknown as MessagePort,
      })
      await new Promise(r => setTimeout(r, 10))
      const msg = port.received[0] as { status: number }
      expect(msg.status).toBe(500)
      s.close()
    })
  })
})
