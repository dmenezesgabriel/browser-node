'use strict'
const http = require('http')

let todos = []
let nextId = 1

function parseBody(req) {
  return new Promise(function (resolve) {
    let data = ''
    req.on('data', function (chunk) { data += chunk })
    req.on('end', function () {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { resolve({}) }
    })
  })
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  if (data) res.end(JSON.stringify(data))
  else res.end()
}

function matchRoute(url, pattern) {
  const regex = new RegExp('^' + pattern.replace(/:\w+/g, '(\\d+)') + '$')
  const match = url.match(regex)
  return match ? match.slice(1).map(Number) : null
}

const server = http.createServer(async function (req, res) {
  const { url, method } = req

  // GET /api/todos
  if (url === '/api/todos' && method === 'GET') {
    return send(res, 200, todos)
  }

  // POST /api/todos
  if (url === '/api/todos' && method === 'POST') {
    const body = await parseBody(req)
    if (!body.text || typeof body.text !== 'string') {
      return send(res, 400, { error: 'text is required' })
    }
    const todo = { id: nextId++, text: body.text, completed: false }
    todos.push(todo)
    return send(res, 201, todo)
  }

  // PATCH /api/todos/:id
  const patchMatch = matchRoute(url, '/api/todos/:id')
  if (patchMatch && method === 'PATCH') {
    const id = patchMatch[0]
    const todo = todos.find(function (t) { return t.id === id })
    if (!todo) return send(res, 404, { error: 'todo not found' })
    const body = await parseBody(req)
    if (typeof body.text === 'string') todo.text = body.text
    if (typeof body.completed === 'boolean') todo.completed = body.completed
    return send(res, 200, todo)
  }

  // DELETE /api/todos/:id
  const deleteMatch = matchRoute(url, '/api/todos/:id')
  if (deleteMatch && method === 'DELETE') {
    const id = deleteMatch[0]
    const idx = todos.findIndex(function (t) { return t.id === id })
    if (idx === -1) return send(res, 404, { error: 'todo not found' })
    todos.splice(idx, 1)
    res.writeHead(204)
    return res.end()
  }

  // Serve static files or index.html for non-API routes
  if (url === '/' || url.startsWith('/')) {
    const fs = require('fs')
    const path = require('path')
    let filePath = url === '/' ? '/index.html' : url
    const fullPath = path.join(__dirname, 'public', filePath)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const ext = path.extname(fullPath)
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' })
      res.end(content)
    } catch {
      send(res, 404, { error: 'not found' })
    }
    return
  }

  send(res, 404, { error: 'not found' })
})

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000
  server.listen(PORT, function () {
    console.log('Node HTTP Todo server on http://localhost:' + PORT)
  })
}

module.exports = { server, app: server, reset: function () { todos = []; nextId = 1 } }
