import { EventEmitter } from './events'

const activeSockets = new Set<WebSocket>()
const servers = new Set<WebSocketServer>()

export class WebSocket extends EventEmitter {
  readyState = 1
  url: string
  
  constructor(url: string) {
    super()
    this.url = url
    activeSockets.add(this)
  }
  
  send(data: any) {
    // Vite sometimes sends Buffers, sometimes strings. Convert Buffer/Uint8Array to string or ArrayBuffer if needed
    // Actually, structured clone algorithm supports Uint8Array.
    self.postMessage({ type: 'ws-recv', url: this.url, data })
  }
  
  close() {
    this.readyState = 3
    activeSockets.delete(this)
    this.emit('close')
  }
}

export class WebSocketServer extends EventEmitter {
  options: any
  
  constructor(options: any) {
    super()
    this.options = options
    servers.add(this)
    if (options.server) {
      options.server.on('upgrade', (req: any, socket: any, head: any) => {
        this.handleUpgrade(req, socket, head, (ws: any) => {
          this.emit('connection', ws, req)
        })
      })
    }
  }
  
  handleUpgrade(req: any, socket: any, head: any, cb: (ws: WebSocket) => void) {
    const ws = new WebSocket(req.url)
    cb(ws)
  }
  
  close() {
    servers.delete(this)
  }
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'ws-client-open') {
     const url = e.data.url
     const ws = new WebSocket(url)
     const req = { url, headers: {} }
     for (const server of servers) {
       server.emit('connection', ws, req)
     }
  }
  if (e.data && e.data.type === 'ws-client-send') {
    const data = e.data.data
    for (const ws of activeSockets) {
       ws.emit('message', data)
    }
  }
})

const wsModule = { WebSocket, WebSocketServer, default: { WebSocket, WebSocketServer } }
export default wsModule
