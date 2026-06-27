/// <reference lib="webworker" />
// Service Worker: routes preview iframe requests to the in-Worker HTTP handler.
//
// Two routing modes:
//   1. Same-origin proxy path  /_proxy/<port>/<path>  (works in all Chrome versions)
//   2. Cross-origin localhost  http://localhost:<port>/<path>  (sub-resource fetches only)

const serverPorts = new Map()

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('message', (e) => {
  const { type, port, listenPort } = e.data ?? {}
  if (type === 'register-server') {
    serverPorts.set(listenPort, port)
  } else if (type === 'unregister-server') {
    serverPorts.delete(listenPort)
  }
})

const clientPorts = new Map()

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  console.log(`[SW FETCH] ${url.pathname} (referrer: ${e.request.referrer})`);

  // Debug test
  if (url.pathname === '/_sw-test') {
    e.respondWith(new Response('<h1>SW Test OK</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
    return
  }
  
  const basePath = new URL(self.registration.scope).pathname
  const proxyPrefix = basePath.endsWith('/') ? basePath + '_proxy/' : basePath + '/_proxy/'

  let listenPort = undefined;
  let proxiedPath = url.pathname + url.search;

  // 1. Check if the URL itself contains the proxy prefix
  if (url.pathname.startsWith(proxyPrefix)) {
    const parts = url.pathname.slice(proxyPrefix.length).split('/')
    listenPort = parseInt(parts[0], 10)
    proxiedPath = '/' + parts.slice(1).join('/') + (url.search || '')
  } 
  // 2. Check the referrer to see if it came from a proxy path
  else if (e.request.referrer) {
    const referrerUrl = new URL(e.request.referrer)
    if (referrerUrl.origin === self.location.origin && referrerUrl.pathname.startsWith(proxyPrefix)) {
      const referrerParts = referrerUrl.pathname.slice(proxyPrefix.length).split('/')
      listenPort = parseInt(referrerParts[0], 10)
    }
  }

  // 3. Fallback to clientId mapping
  if (!listenPort && e.clientId && clientPorts.has(e.clientId)) {
    listenPort = clientPorts.get(e.clientId)
  }

  // If we found a port, intercept the request
  if (listenPort) {
    const workerPort = serverPorts.get(listenPort)
    if (workerPort) {
      // Save the association for future requests from this client
      if (e.request.destination !== 'iframe' && e.request.destination !== 'document' && e.clientId) {
        // Only associate if the request came from within the proxy (e.g. iframe with <base>)
        // to prevent the IDE main frame from being permanently mapped to the proxy port.
        if (e.request.referrer && new URL(e.request.referrer).pathname.startsWith(proxyPrefix)) {
          clientPorts.set(e.clientId, listenPort)
        }
      }
      if (e.resultingClientId) clientPorts.set(e.resultingClientId, listenPort)

      e.respondWith(forwardToWorker(workerPort, e.request, proxiedPath, listenPort))
      return
    }
  }

  // 4. Cross-origin localhost sub-resource fetches
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // Don't intercept /_npm requests — they need to reach the real Vite proxy
    if (url.pathname.startsWith('/_npm')) return
    // Don't intercept navigation — the IDE itself is served on localhost:5173
    if (e.request.destination === 'document') return
    const port = url.port ? parseInt(url.port, 10) : 80
    const workerPort = serverPorts.get(port)
    if (workerPort) {
      e.respondWith(forwardToWorker(workerPort, e.request, url.pathname + url.search, port))
    }
  }
})

async function forwardToWorker(workerPort, request, path, listenPort) {
  const body = request.body ? await request.arrayBuffer() : null

  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()

    // Safety timeout: if the Worker never responds, unblock the fetch.
    const timeout = setTimeout(() => {
      port1.close()
      resolve(new Response(`<pre>Timeout: Worker did not respond for port ${listenPort}</pre>`, {
        status: 408,
        headers: { 'content-type': 'text/html', 'Cross-Origin-Resource-Policy': 'cross-origin' }
      }))
    }, 30000)

    port1.onmessage = (e) => {
      clearTimeout(timeout)
      const { status, headers, body } = e.data
      // Add COEP-compatible headers so Chrome allows embedding in a COEP:credentialless page
      const responseHeaders = {
        ...headers,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      }
      resolve(new Response(body, { status, headers: responseHeaders }))
      port1.close()
    }

    workerPort.postMessage(
      {
        type: 'http-request',
        listenPort,
        method: request.method,
        url: path,
        headers: Object.fromEntries(request.headers.entries()),
        body,
        replyPort: port2,
      },
      body ? [port2, body] : [port2]
    )
  })
}
