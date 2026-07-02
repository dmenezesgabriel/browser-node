import { Editor } from './editor'
import { TerminalUI } from './terminal-ui'
import { FileExplorer } from './explorer'

// ── Web Worker ────────────────────────────────────────────────────────────────

const runtimeWorker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' })
;(window as any).__worker = runtimeWorker;
let workerReady = false

function send(msg: unknown, transfer?: Transferable[]) {
  runtimeWorker.postMessage(msg, transfer ?? [])
}

// ── Service Worker ────────────────────────────────────────────────────────────

let swReady = false

async function registerSW() {
  if (!('serviceWorker' in navigator)) return
  try {
    const base = import.meta.env.BASE_URL  // '/' in dev, '/sandbox/' in prod
    await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
    
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    await navigator.serviceWorker.ready
    swReady = true
  } catch { /* SW optional — HTTP server preview disabled */ }
}

const _listenTimers = new Map<number, ReturnType<typeof setTimeout>>()
let _serverRunningPort: number | null = null

function registerServerWithSW(port: number) {
  if (!swReady || !navigator.serviceWorker.controller) return
  _serverRunningPort = port
  const { port1, port2 } = new MessageChannel()
  send({ type: 'register-server-port', port, workerPort: port1 }, [port1])
  navigator.serviceWorker.controller.postMessage({ type: 'register-server', listenPort: port, port: port2 }, [port2])
  const urlInput = document.getElementById('preview-url') as HTMLInputElement
  urlInput.value = `http://localhost:${port}/`
  setPreviewStatus('ok', `Server :${port}`)
  setTimeout(() => loadPreview(port, '/'), 300)
}

function unregisterServerWithSW(port: number) {
  navigator.serviceWorker.controller?.postMessage({ type: 'unregister-server', listenPort: port })
}

async function loadPreview(port: number, path: string) {
  const base = import.meta.env.BASE_URL
  const proxyPrefix = base.endsWith('/') ? `${base}_proxy/` : `${base}/_proxy/`
  const proxyBase = `${location.origin}${proxyPrefix}${port}`
  const proxyUrl = `${proxyBase}${path}`
  try {
    const resp = await fetch(proxyUrl)
    if (!resp.ok) {
      previewFrame.srcdoc = previewErrorHtml(port, `Server responded with ${resp.status}`)
      setPreviewStatus('err', `Error ${resp.status}`)
      return
    }
    let html = await resp.text()
    if (!html.trim()) return

    // Rewrite absolute-path URLs ("/foo") in HTML attributes so they go through the proxy.
    // The <base href="..."> tag DOES NOT affect absolute-path URLs (those starting with /)
    // because browsers always resolve them against the document origin, not the base.
    // We must rewrite them before the browser parses the srcdoc HTML.
    html = rewriteHtmlAbsolutePaths(html, proxyBase)

    // Inject <base> (for relative paths) plus a runtime patch for dynamic fetch/XHR calls
    const injection = `<base href="${proxyUrl}"><script>
;(function(){
  var _b='${proxyBase}';
  function _p(u){return(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))?_b+u:u}
  var _f=window.fetch;window.fetch=function(u,o){return _f.call(this,_p(u),o)};
  var _x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return _x.apply(this,[m,_p(u)].concat([].slice.call(arguments,2)))};
  var _WS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    if (typeof url === 'string' && (url.includes('5173') || url.includes('5176') || url.includes('3000'))) {
      var ws = new EventTarget();
      ws.url = url;
      ws.readyState = 1;
      ws.send = function(data) { window.parent.postMessage({ type: 'ws-client-send', url: url, data: data }, '*') };
      ws.close = function() {};
      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'ws-recv' && e.data.url === url) {
           var ev = new MessageEvent('message', { data: e.data.data });
           ws.dispatchEvent(ev);
           if (ws.onmessage) ws.onmessage(ev);
        }
      });
      setTimeout(function() {
        window.parent.postMessage({ type: 'ws-client-open', url: url }, '*');
        var ev = new Event('open');
        ws.dispatchEvent(ev);
        if (ws.onopen) ws.onopen(ev);
      }, 50);
      return ws;
    }
    return new _WS(url, protocols);
  };
})();
<\/script>`.replace('<\/script>', '</script>')
    if (html.includes('<head>')) html = html.replace('<head>', '<head>' + injection)
    else html = injection + html
    previewFrame.srcdoc = html
    setPreviewStatus('ok', `Server :${port}`)
  } catch {
    previewFrame.srcdoc = previewErrorHtml(port, 'Could not reach the server')
    setPreviewStatus('err', 'Unreachable')
  }
}

/** Rewrite absolute-path URLs (starting with /) in HTML to go via proxyBase.
 *  Handles:
 *    - Attribute values: src="/..." href="/..." action="/..." srcset="/..."
 *    - CSS url(/...) in style blocks/attributes
 *    - ESM import specifiers inside <script type="module"> inline blocks:
 *        import X from '/...'   →  import X from 'http://.../_proxy/PORT/...'
 *        import('/...')         →  import('http://..._proxy/PORT/...')
 *  Skips protocol-relative "//" URLs.
 */
function rewriteHtmlAbsolutePaths(html: string, proxyBase: string): string {
  // 1. Rewrite quoted attribute values: src="/...", href="/...", etc.
  html = html.replace(
    /((?:src|href|action|srcset|data-src)\s*=\s*)(["'])(\/[^"']*)\2/gi,
    (match, attr, quote, url) => {
      if (url.startsWith('//')) return match  // protocol-relative, keep
      return `${attr}${quote}${proxyBase}${url}${quote}`
    }
  )

  // 2. Rewrite CSS url(/...) references in style attributes and inline <style> blocks
  html = html.replace(
    /url\(\s*(["']?)(\/[^"')]*)\1\s*\)/gi,
    (match, quote, url) => {
      if (url.startsWith('//')) return match
      return `url(${quote}${proxyBase}${url}${quote})`
    }
  )

  // 3. Rewrite ES module bare specifiers inside inline <script type="module"> blocks.
  //    @vitejs/plugin-react injects: import RefreshRuntime from '/@react-refresh'
  //    These are inside <script> text, NOT attributes, so attr rewriting can't reach them.
  //    Pattern matches: from '/...'  |  from "/..."  |  import('/...')  |  import("/...")
  html = html.replace(
    /(<script\b[^>]*type\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (match, openTag, scriptBody, closeTag) => {
      const rewritten = scriptBody
        // import X from '/path'
        .replace(/(from\s*)(["'])(\/[^"']*)\2/g, (m: string, kw: string, q: string, u: string) =>
          u.startsWith('//') ? m : `${kw}${q}${proxyBase}${u}${q}`)
        // dynamic import('/path')
        .replace(/(import\s*\()(["'])(\/[^"']*)\2/g, (m: string, kw: string, q: string, u: string) =>
          u.startsWith('//') ? m : `${kw}${q}${proxyBase}${u}${q}`)
      return `${openTag}${rewritten}${closeTag}`
    }
  )

  return html
}


// ── Hidden test-interface log buffer ─────────────────────────────────────────

const _testLog = document.getElementById('terminal') as HTMLDivElement
let _cmdSeq = 0

function _appendTestLog(text: string) {
  _testLog.textContent = (_testLog.textContent ?? '') + text
}

// ── DOM refs ─────────────────────────────────────────────────────────────────

const sidebar         = document.getElementById('sidebar') as HTMLDivElement
const editorPanel     = document.getElementById('editor-panel') as HTMLDivElement
const previewPanel    = document.getElementById('preview-panel') as HTMLDivElement
const previewFrame    = document.getElementById('preview') as HTMLIFrameElement
const previewStatusEl = document.getElementById('preview-status') as HTMLSpanElement
const termPanel       = document.getElementById('terminal-panel') as HTMLDivElement
const termXterm       = document.getElementById('terminal-xterm') as HTMLDivElement
const termTopbarCwd   = document.getElementById('terminal-topbar-cwd') as HTMLSpanElement
const explorerEl      = document.getElementById('explorer') as HTMLDivElement
const workerStatusEl  = document.getElementById('worker-status') as HTMLDivElement
const btnSidebarTgl   = document.getElementById('btn-sidebar-toggle') as HTMLButtonElement
const btnEditor       = document.getElementById('btn-editor') as HTMLButtonElement
const btnPreview      = document.getElementById('btn-preview') as HTMLButtonElement
const btnRun          = document.getElementById('btn-run') as HTMLButtonElement
const btnNewFile      = document.getElementById('btn-new-file') as HTMLButtonElement
const btnRefresh      = document.getElementById('btn-refresh') as HTMLButtonElement
const statusbarFile   = document.getElementById('statusbar-file') as HTMLSpanElement
const statusbarMsg    = document.getElementById('statusbar-msg') as HTMLSpanElement
const termDrag        = document.getElementById('terminal-drag') as HTMLDivElement
const editorTabs      = document.getElementById('editor-tabs') as HTMLDivElement
const sidebarDrag     = document.getElementById('sidebar-drag') as HTMLDivElement

// ── UI components ─────────────────────────────────────────────────────────────

const editor = new Editor(editorPanel)
editor.onSave = (content, filename) => {
  send({ type: 'write-file', path: filename, content })
}
const terminalUI = new TerminalUI(termXterm, (cmd) => {
  send({ type: 'terminal-cmd', cmdline: cmd })
})
const explorer = new FileExplorer(
  explorerEl,
  (path) => { send({ type: 'vfs-read', path }) },
  (path) => { send({ type: 'vfs-list', path }) },
)

// ── Sidebar toggle ────────────────────────────────────────────────────────────

let sidebarOpen = window.innerWidth >= 640

function setSidebar(open: boolean) {
  sidebarOpen = open
  sidebar.classList.toggle('collapsed', !open)
  setTimeout(() => terminalUI.refit(), 150)
}

setSidebar(sidebarOpen)
btnSidebarTgl.addEventListener('click', () => setSidebar(!sidebarOpen))

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    setSidebar(!sidebarOpen)
  }
})

// ── Tabs State ────────────────────────────────────────────────────────────────

const openFiles: string[] = []
let activeFile: string | null = null

function updateTabsUI() {
  editorTabs.innerHTML = ''
  if (openFiles.length === 0) {
    editorTabs.classList.add('hidden')
    statusbarFile.textContent = 'No file open'
    return
  }
  editorTabs.classList.remove('hidden')
  for (const file of openFiles) {
    const tab = document.createElement('div')
    tab.className = 'editor-tab' + (file === activeFile ? ' active' : '')
    const name = file.split('/').pop() || file
    
    const nameEl = document.createElement('span')
    nameEl.className = 'editor-tab-name'
    nameEl.textContent = name
    nameEl.title = file
    tab.appendChild(nameEl)
    
    const closeBtn = document.createElement('button')
    closeBtn.className = 'editor-tab-close'
    closeBtn.textContent = '×'
    closeBtn.title = 'Close'
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(file)
    })
    tab.appendChild(closeBtn)

    tab.addEventListener('click', () => {
      if (activeFile !== file) {
        activeFile = file
        editor.switchFile(file)
        explorer.setActive(file)
        statusbarFile.textContent = file
        updateTabsUI()
      }
    })
    editorTabs.appendChild(tab)
  }
}

function closeTab(file: string) {
  const idx = openFiles.indexOf(file)
  if (idx === -1) return
  openFiles.splice(idx, 1)
  editor.closeFile(file)
  if (activeFile === file) {
    activeFile = openFiles.length > 0 ? openFiles[Math.max(0, idx - 1)] : null
    if (activeFile) {
      editor.switchFile(activeFile)
      explorer.setActive(activeFile)
      statusbarFile.textContent = activeFile
      editorPanel.style.display = ''
    } else {
      explorer.setActive('')
      statusbarFile.textContent = 'No file open'
      editorPanel.style.display = 'none'
    }
  }
  updateTabsUI()
}

// ── Tab toggle ────────────────────────────────────────────────────────────────

function showTab(tab: 'editor' | 'preview') {
  const isEditor = tab === 'editor'
  editorPanel.classList.toggle('hidden', !isEditor)
  previewPanel.classList.toggle('visible', !isEditor)
  btnEditor.classList.toggle('active', isEditor)
  btnPreview.classList.toggle('active', !isEditor)
  if (isEditor) terminalUI.refit()
  if (!isEditor && !_serverRunningPort) {
    if (!previewFrame.srcdoc || !previewFrame.srcdoc.includes('No server running')) {
      previewFrame.srcdoc = noServerHtml()
      setPreviewStatus('warn', 'No server')
    }
  }
}

function noServerHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
  .box { max-width: 520px; padding: 2rem; }
  h2 { color: #8b949e; font-size: 1.1rem; font-weight: 400; margin-bottom: 0.5rem; }
  p  { color: #484f58; font-size: 0.9rem; line-height: 1.6; }
  kbd { border: 1px solid #30363d; border-radius: 3px; padding: 1px 5px; font-family: inherit; font-size: 0.85rem; color: #8b949e; background: #161b22; }
</style></head>
<body><div class="box">
  <h2>No server running</h2>
  <p>Start one in the terminal, e.g.<br><kbd>cd /examples/express && npm install && node index.js</kbd></p>
</div></body></html>`
}

btnEditor.addEventListener('click', () => showTab('editor'))
btnPreview.addEventListener('click', () => showTab('preview'))
showTab('editor')

// ── Run button ────────────────────────────────────────────────────────────────

btnRun.addEventListener('click', () => {
  if (!workerReady) return
  const code = editor.value
  const filename = editor.filename
  send({ type: 'run', code, filename })
  terminalUI.write(`\x1b[35m▶ node ${filename}\x1b[0m\r\n`)
})

// ── New file ─────────────────────────────────────────────────────────────────

function promptNewFile() {
  const name = prompt('New file path (e.g. /examples/myapp/index.js):')
  if (!name?.trim()) return
  const path = name.trim().startsWith('/') ? name.trim() : '/examples/' + name.trim()
  send({ type: 'write-file', path, content: '' })
  send({ type: 'vfs-read', path })
  explorer.refresh()
}

btnNewFile.addEventListener('click', promptNewFile)

// ── Preview refresh ───────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', () => {
  if (!_serverRunningPort) {
    previewFrame.srcdoc = noServerHtml()
    setPreviewStatus('warn', 'No server')
    return
  }
  const urlInput = document.getElementById('preview-url') as HTMLInputElement
  const port = _serverRunningPort
  urlInput.value = `http://localhost:${port}/`
  previewFrame.srcdoc = ''
  loadPreview(port, '/')
})

// ── Terminal resize drag ──────────────────────────────────────────────────────

let _dragging = false
let _dragStartY = 0
let _dragStartH = 0

termDrag.addEventListener('mousedown', (e) => {
  _dragging = true
  _dragStartY = e.clientY
  _dragStartH = termPanel.offsetHeight
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
})

document.addEventListener('mousemove', (e) => {
  if (_dragging) {
    const delta = _dragStartY - e.clientY
    const newH = Math.max(80, Math.min(window.innerHeight * 0.8, _dragStartH + delta))
    termPanel.style.height = newH + 'px'
    terminalUI.refit()
  }
  if (_sbDragging) {
    const delta = e.clientX - _sbStartX
    const newW = Math.max(150, Math.min(window.innerWidth * 0.6, _sbStartW + delta))
    document.documentElement.style.setProperty('--sidebar-w', `${newW}px`)
    if (!sidebarOpen) setSidebar(true)
    terminalUI.refit()
  }
})

document.addEventListener('mouseup', () => {
  if (_dragging || _sbDragging) {
    _dragging = false
    _sbDragging = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})

// ── Sidebar resize drag ───────────────────────────────────────────────────────

let _sbDragging = false
let _sbStartX = 0
let _sbStartW = 0

sidebarDrag.addEventListener('mousedown', (e) => {
  _sbDragging = true
  _sbStartX = e.clientX
  _sbStartW = sidebar.offsetWidth
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
})

// ── Worker messages ───────────────────────────────────────────────────────────

function setWorkerStatus(state: 'loading' | 'ready' | 'busy' | 'error') {
  workerStatusEl.className = ''
  if (state !== 'loading') workerStatusEl.classList.add(state)
}

function setStatusMsg(msg: string) {
  statusbarMsg.textContent = msg
}

function setPreviewStatus(state: 'ok' | 'warn' | 'err' | '', text: string) {
  previewStatusEl.className = state
  previewStatusEl.textContent = state ? text : ''
}

function previewErrorHtml(port: number, detail: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
  .box { max-width: 480px; padding: 2rem; }
  h2 { color: #f85149; font-size: 1.3rem; margin-bottom: 0.5rem; }
  p { color: #8b949e; font-size: 0.95rem; line-height: 1.5; }
  code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
</style></head>
<body><div class="box">
  <h2>⚠ Preview Error</h2>
  <p>${detail} on port <code>${port}</code>.</p>
  <p>Start the server in the terminal, then click <strong>Refresh</strong>.</p>
</div></body></html>`
}

runtimeWorker.addEventListener('message', (e: MessageEvent) => {
  const { type, ...p } = e.data ?? {}

  if (type === 'ready') {
    workerReady = true
    btnRun.disabled = false
    setWorkerStatus('ready')
    setStatusMsg('Ready')
    _appendTestLog('[runtime] Worker ready.\n')
    // Transfer SW↔Worker MessageChannel port
    const { port1: toWorker, port2: toShell } = new MessageChannel()
    send({ type: 'set-sw-port', port: toWorker }, [toWorker])
    toShell.close()
    terminalUI.setReady('/examples')
    explorer.refresh()
    send({ type: 'vfs-get-files' })
    return
  }

  if (type === 'stdout') {
    _appendTestLog(p.text)
    terminalUI.write(p.text)
    return
  }
  if (type === 'stderr') {
    _appendTestLog(p.text)
    terminalUI.write(`\x1b[31m${p.text}\x1b[0m`)
    return
  }

  if (type === 'log') {
    _appendTestLog(`[worker] ${(p.args ?? []).map(String).join(' ')}\n`)
    console.log('[worker]', ...(p.args ?? []))
    return
  }

  if (type === 'terminal-done') {
    if (p.exitCode === -1) terminalUI.clear()
    if (p.cwd) {
      terminalUI.setCwd(p.cwd)
      termTopbarCwd.textContent = p.cwd
    }
    terminalUI.showPrompt()
    setWorkerStatus('ready')
    _appendTestLog(`[cmd:${++_cmdSeq}:exit${p.exitCode ?? 0}]\n`)
    return
  }

  if (type === 'terminal-cwd') {
    terminalUI.setCwd(p.cwd)
    termTopbarCwd.textContent = p.cwd
    return
  }

  if (type === 'vfs-changed') {
    explorer.refresh()
    send({ type: 'vfs-get-files' })
    return
  }

  if (type === 'vfs-get-files-result') {
    editor.syncVfsFiles(p.files)
    return
  }

  if (type === 'vfs-list-result') {
    explorer.updateDir(p.path, p.entries)
    return
  }

  if (type === 'vfs-read-result') {
    if (p.content !== null && p.content !== undefined) {
      if (!openFiles.includes(p.path)) openFiles.push(p.path)
      activeFile = p.path
      editor.openFile(p.content, p.path)
      explorer.setActive(p.path)
      statusbarFile.textContent = p.path
      editorPanel.style.display = ''
      updateTabsUI()
      showTab('editor')
    }
    return
  }

  if (type === 'server-listen') {
    if (_listenTimers.has(p.port)) clearTimeout(_listenTimers.get(p.port)!)
    _listenTimers.set(p.port, setTimeout(() => {
      _listenTimers.delete(p.port)
      registerServerWithSW(p.port)
      setStatusMsg(`Server on :${p.port}`)
    }, 50))
    return
  }

  if (type === 'server-close') {
    if (_serverRunningPort === p.port) {
      _serverRunningPort = null
      previewFrame.srcdoc = noServerHtml()
      setPreviewStatus('warn', 'No server')
    }
    unregisterServerWithSW(p.port)
    setStatusMsg('Ready')
    return
  }

  if (type === 'npm-done') {
    setWorkerStatus('ready')
    setStatusMsg('Ready')
    if (_testLog.textContent?.includes('[npm error]') || _testLog.textContent?.includes('[error]')) {
      _appendTestLog('Install failed\n')
    } else {
      _appendTestLog('Install complete\n')
    }
    return
  }

  if (type === 'ws-recv') {
    if (previewFrame.contentWindow) {
      previewFrame.contentWindow.postMessage(e.data, '*')
    }
    return
  }
})

runtimeWorker.addEventListener('error', (e) => {
  setWorkerStatus('error')
  terminalUI.write(`\x1b[31m[worker error] ${e.message}\x1b[0m\r\n`)
})

// ── Boot ──────────────────────────────────────────────────────────────────────

setStatusMsg('Initializing…')
registerSW()

window.addEventListener('message', (e) => {
  if (e.data && (e.data.type === 'ws-client-send' || e.data.type === 'ws-client-open')) {
    runtimeWorker.postMessage(e.data)
  }
})

// Playwright test hook
;(window as unknown as Record<string, unknown>)._sendToWorker = (msg: unknown) => runtimeWorker.postMessage(msg)

