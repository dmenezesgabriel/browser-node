'use strict'
const fs = require('fs')
const path = require('path')
const fastify = require('fastify')

let todos = []
let nextId = 1

function buildApp() {
  const app = fastify({ logger: false })

  // Serve the static UI (index.html at /) — the fastify equivalent of
  // express.static('public') for this single-page app.
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  app.get('/', async function (req, reply) {
    reply.type('text/html')
    return indexHtml
  })

  app.get('/api/todos', async function () {
    return todos
  })

  app.post('/api/todos', async function (req, reply) {
    const { text } = req.body
    if (!text || typeof text !== 'string') {
      reply.code(400)
      return { error: 'text is required' }
    }
    const todo = { id: nextId++, text, completed: false }
    todos.push(todo)
    reply.code(201)
    return todo
  })

  app.patch('/api/todos/:id', async function (req, reply) {
    const id = Number(req.params.id)
    const todo = todos.find(function (t) { return t.id === id })
    if (!todo) { reply.code(404); return { error: 'todo not found' } }
    if (typeof req.body.text === 'string') todo.text = req.body.text
    if (typeof req.body.completed === 'boolean') todo.completed = req.body.completed
    return todo
  })

  app.delete('/api/todos/:id', async function (req, reply) {
    const id = Number(req.params.id)
    const idx = todos.findIndex(function (t) { return t.id === id })
    if (idx === -1) { reply.code(404); return { error: 'todo not found' } }
    todos.splice(idx, 1)
    reply.code(204)
    return ''
  })

  return app
}

const app = buildApp()

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000
  app.listen({ port: PORT }, function (err) {
    if (err) { console.error(err.message); return }
    console.log('Fastify Todo server on http://localhost:' + PORT)
  })
}

module.exports = { app, reset: function () { todos = []; nextId = 1 } }
